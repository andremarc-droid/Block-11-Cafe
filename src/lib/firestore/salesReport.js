import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig.js";

const ORDERS_COLLECTION = "orders";
const CATEGORIES_COLLECTION = "categories";
const MENU_ITEMS_COLLECTION = "menuItems";

export const PERIODS = [
  { id: "daily", label: "Daily", title: "Daily Summary" },
  { id: "weekly", label: "Weekly", title: "Weekly Summary" },
  { id: "monthly", label: "Monthly", title: "Monthly Summary" },
  { id: "yearly", label: "Yearly", title: "Yearly Summary" },
];

/**
 * Calculates start of the period based on browser local time at 00:00:00.
 */
export function getPeriodStartDate(periodId) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  switch (periodId?.toLowerCase()) {
    case "weekly":
      start.setDate(start.getDate() - 7);
      break;
    case "monthly":
      start.setDate(start.getDate() - 30);
      break;
    case "yearly":
      start.setDate(start.getDate() - 365);
      break;
    case "daily":
    default:
      // today 00:00:00
      break;
  }

  return start;
}

// 60-second in-memory cache per period
const CACHE_TTL_MS = 60 * 1000;
const reportCache = new Map();

/**
 * Resolves category paths and product names for menu items by reading categories
 * and ALL menuItems documents (including inactive ones, because old orders can reference removed items).
 * Only invoked when there are top selling products to label.
 */
async function fetchCategoryPaths() {
  try {
    const [categoriesSnap, menuItemsSnap] = await Promise.all([
      getDocs(collection(db, CATEGORIES_COLLECTION)),
      getDocs(collection(db, MENU_ITEMS_COLLECTION)),
    ]);

    const categoriesMap = new Map();
    categoriesSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const numId = Number(docSnap.id);
      const strId = String(docSnap.id);
      const catInfo = {
        name: data.name || "",
        subCategories: Array.isArray(data.subCategories) ? data.subCategories : [],
      };
      if (!isNaN(numId)) {
        categoriesMap.set(numId, catInfo);
      }
      categoriesMap.set(strId, catInfo);
    });

    const pathsMap = new Map();
    const namesMap = new Map();

    menuItemsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const itemId = Number(docSnap.id);
      const strItemId = String(docSnap.id);

      if (data.name) {
        if (!isNaN(itemId)) namesMap.set(itemId, data.name);
        namesMap.set(strItemId, data.name);
      }

      const catId = Number(data.categoryId);
      const subCatId =
        data.subCategoryId !== null &&
        data.subCategoryId !== undefined &&
        data.subCategoryId !== ""
          ? Number(data.subCategoryId)
          : null;

      const cat =
        categoriesMap.get(catId) ||
        categoriesMap.get(String(data.categoryId));

      if (!cat) {
        if (!isNaN(itemId)) pathsMap.set(itemId, "Uncategorized");
        pathsMap.set(strItemId, "Uncategorized");
        return;
      }

      const hasSubCats =
        Array.isArray(cat.subCategories) && cat.subCategories.length > 0;
      if (!hasSubCats) {
        if (!isNaN(itemId)) pathsMap.set(itemId, cat.name);
        pathsMap.set(strItemId, cat.name);
        return;
      }

      if (subCatId === null || isNaN(subCatId)) {
        const path = `${cat.name} > Unassigned`;
        if (!isNaN(itemId)) pathsMap.set(itemId, path);
        pathsMap.set(strItemId, path);
        return;
      }

      const sub = cat.subCategories.find(
        (s) => Number(s.subCategoryId) === subCatId
      );
      const finalPath =
        sub && sub.name
          ? `${cat.name} > ${sub.name}`
          : `${cat.name} > Unassigned`;

      if (!isNaN(itemId)) pathsMap.set(itemId, finalPath);
      pathsMap.set(strItemId, finalPath);
    });

    return { pathsMap, namesMap };
  } catch (err) {
    console.error("Failed to load category paths for sales report:", err);
    return { pathsMap: new Map(), namesMap: new Map() };
  }
}

/**
 * Paged query through orders starting from startDate, capped at 5,000 orders.
 * Reads orders and normalizes orderType and payment at read time (MapOrder behavior).
 * Sets hitSafetyLimit only when 5,000 orders were fetched and a further page still has more.
 */
async function fetchOrdersForPeriod(startDate) {
  const startTimestamp = Timestamp.fromDate(startDate);
  const ordersRef = collection(db, ORDERS_COLLECTION);

  const allOrders = [];
  let lastVisibleDoc = null;
  let hitSafetyLimit = false;

  while (allOrders.length < 5000) {
    const fetchLimit = Math.min(500, 5000 - allOrders.length);
    let q = query(
      ordersRef,
      where("createdAt", ">=", startTimestamp),
      orderBy("createdAt", "desc"),
      limit(fetchLimit)
    );

    if (lastVisibleDoc) {
      q = query(
        ordersRef,
        where("createdAt", ">=", startTimestamp),
        orderBy("createdAt", "desc"),
        startAfter(lastVisibleDoc),
        limit(fetchLimit)
      );
    }

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      break;
    }

    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();

      // Read-time normalization matching desktop MapOrder:
      // Missing or empty orderType counts as "Dine In"
      const rawOrderType =
        typeof data.orderType === "string" ? data.orderType.trim() : "";
      const orderType = rawOrderType || "Dine In";

      // When payment exists but payment.method is missing, treat as "Cash"
      let payment = data.payment;
      if (payment && typeof payment === "object") {
        const rawMethod =
          typeof payment.method === "string" ? payment.method.trim() : "";
        payment = {
          ...payment,
          method: rawMethod || "Cash",
        };
      }

      allOrders.push({
        id: docSnap.id,
        ...data,
        orderType,
        payment,
      });
    });

    lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

    if (snapshot.docs.length < fetchLimit) {
      break;
    }
  }

  // Set hitSafetyLimit only when 5,000 orders were fetched and a further page still has more
  if (allOrders.length >= 5000 && lastVisibleDoc) {
    const probeQuery = query(
      ordersRef,
      where("createdAt", ">=", startTimestamp),
      orderBy("createdAt", "desc"),
      startAfter(lastVisibleDoc),
      limit(1)
    );
    const probeSnap = await getDocs(probeQuery);
    if (!probeSnap.empty) {
      hitSafetyLimit = true;
    }
  }

  return { orders: allOrders, hitSafetyLimit };
}

/**
 * Aggregates orders into a SalesSummary matching the desktop POS calculations.
 */
export async function getSalesSummary(periodId = "daily", forceRefresh = false) {
  const normalizedPeriodId = periodId.toLowerCase();
  const periodMeta =
    PERIODS.find((p) => p.id === normalizedPeriodId) || PERIODS[0];

  const now = Date.now();
  if (!forceRefresh) {
    const cached = reportCache.get(normalizedPeriodId);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return {
        summary: cached.summary,
        hitSafetyLimit: cached.hitSafetyLimit,
        isCached: true,
      };
    }
  }

  const startDate = getPeriodStartDate(normalizedPeriodId);
  const { orders: periodOrders, hitSafetyLimit } = await fetchOrdersForPeriod(startDate);

  // 1. Financial Overview
  // Round each order's totalDue and refund.refundAmount to 2 decimals before summing to avoid centavo drift
  let gross = 0;
  let refundsTotal = 0;
  let refundCount = 0;

  for (const ord of periodOrders) {
    const orderTotalDue = Math.round((Number(ord.totalDue) || 0) * 100) / 100;
    gross = Math.round((gross + orderTotalDue) * 100) / 100;

    const isRefunded =
      String(ord.orderStatus || "").trim().toLowerCase() === "refunded" &&
      ord.refund != null;
    if (isRefunded) {
      const refundAmount =
        Math.round((Number(ord.refund?.refundAmount) || 0) * 100) / 100;
      refundsTotal = Math.round((refundsTotal + refundAmount) * 100) / 100;
      refundCount++;
    }
  }

  const totalOrders = periodOrders.length;
  const netRevenue = Math.round((gross - refundsTotal) * 100) / 100;
  const averageOrderValue =
    totalOrders > 0 ? Math.round((gross / totalOrders) * 100) / 100 : 0;
  const refundRate = totalOrders > 0 ? (refundCount / totalOrders) * 100 : 0;

  // 2. Hourly Velocity (7 buckets: 8 AM, 10 AM, 12 PM, 2 PM, 4 PM, 6 PM, 8 PM)
  const hourlyBuckets = [
    { hour: 8, label: "8 AM", colorHex: "#F59E0B" },
    { hour: 10, label: "10 AM", colorHex: "#0D9488" },
    { hour: 12, label: "12 PM", colorHex: "#10B981" },
    { hour: 14, label: "2 PM", colorHex: "#2563EB" },
    { hour: 16, label: "4 PM", colorHex: "#6366F1" },
    { hour: 18, label: "6 PM", colorHex: "#8B5CF6" },
    { hour: 20, label: "8 PM", colorHex: "#F43F5E" },
  ];
  const hourlyMap = { 8: 0, 10: 0, 12: 0, 14: 0, 16: 0, 18: 0, 20: 0 };

  for (const ord of periodOrders) {
    const orderTotalDue = Math.round((Number(ord.totalDue) || 0) * 100) / 100;

    let dateObj;
    if (ord.createdAt?.toDate) {
      dateObj = ord.createdAt.toDate();
    } else if (ord.createdAt?.seconds) {
      dateObj = new Date(ord.createdAt.seconds * 1000);
    } else if (ord.createdAt) {
      dateObj = new Date(ord.createdAt);
    } else {
      dateObj = new Date();
    }

    const hr = dateObj.getHours();
    let bestBucket;
    if (hr <= 9) bestBucket = 8;
    else if (hr <= 11) bestBucket = 10;
    else if (hr <= 13) bestBucket = 12;
    else if (hr <= 15) bestBucket = 14;
    else if (hr <= 17) bestBucket = 16;
    else if (hr <= 19) bestBucket = 18;
    else bestBucket = 20;

    hourlyMap[bestBucket] =
      Math.round((hourlyMap[bestBucket] + orderTotalDue) * 100) / 100;
  }

  const maxHour = Math.max(...Object.values(hourlyMap), 0);
  const hourlyVelocity = hourlyBuckets.map((b) => {
    const amt = hourlyMap[b.hour] || 0;
    let pct = 0;
    if (maxHour > 0 && amt > 0) {
      pct = amt / maxHour;
      if (pct < 0.15) pct = 0.15;
    }
    return {
      timeLabel: b.label,
      amount: amt,
      barHeightPercentage: pct,
      colorHex: b.colorHex,
      hasSales: amt > 0,
    };
  });

  // 3. Payment Method Breakdown (fixed order: GCash, Cash, Card, Tap to Pay)
  // Match only "GCash", "Cash", "Card", and "Tap to Pay" case-insensitively (aliases removed)
  const paymentMethodsConfig = [
    { label: "GCash", colorHex: "#2563EB", match: (m) => m === "gcash" },
    { label: "Cash", colorHex: "#16A34A", match: (m) => m === "cash" },
    { label: "Card", colorHex: "#9333EA", match: (m) => m === "card" },
    {
      label: "Tap to Pay",
      colorHex: "#EA580C",
      match: (m) => m === "tap to pay",
    },
  ];

  const paymentMethodBreakdown = paymentMethodsConfig.map((config) => {
    const matched = periodOrders.filter((o) => {
      const m = String(o.payment?.method || "").trim().toLowerCase();
      return config.match(m);
    });
    const total = matched.reduce((sum, o) => {
      const due = Math.round((Number(o.totalDue) || 0) * 100) / 100;
      return Math.round((sum + due) * 100) / 100;
    }, 0);
    const pct = gross > 0 ? (total / gross) * 100 : 0;
    return {
      label: config.label,
      orderCount: matched.length,
      totalAmount: total,
      percentage: pct,
      colorHex: config.colorHex,
    };
  });

  // 4. Order Type Breakdown (fixed order: Dine In, Take Out, Delivery)
  // Match only "Dine In", "Take Out", and "Delivery" case-insensitively (aliases removed)
  const orderTypesConfig = [
    {
      label: "Dine In",
      colorHex: "#10B981",
      match: (t) => t === "dine in",
    },
    {
      label: "Take Out",
      colorHex: "#D97706",
      match: (t) => t === "take out",
    },
    {
      label: "Delivery",
      colorHex: "#0284C7",
      match: (t) => t === "delivery",
    },
  ];

  const orderTypeBreakdown = orderTypesConfig.map((config) => {
    const matched = periodOrders.filter((o) => {
      const t = String(o.orderType || "").trim().toLowerCase();
      return config.match(t);
    });
    const total = matched.reduce((sum, o) => {
      const due = Math.round((Number(o.totalDue) || 0) * 100) / 100;
      return Math.round((sum + due) * 100) / 100;
    }, 0);
    const pct = gross > 0 ? (total / gross) * 100 : 0;
    return {
      label: config.label,
      orderCount: matched.length,
      totalAmount: total,
      percentage: pct,
      colorHex: config.colorHex,
    };
  });

  // 5. Top 5 Selling Products (group by menuItemId, never by name)
  // Compute line revenue as unitPrice × quantity, rounded to 2 decimals (not stored subtotal).
  // Do not skip menuItemId <= 0.
  const productSales = new Map();
  for (const ord of periodOrders) {
    const items = Array.isArray(ord.items) ? ord.items : [];
    for (const itm of items) {
      if (itm.menuItemId === null || itm.menuItemId === undefined) continue;
      const mid = Number(itm.menuItemId);
      if (isNaN(mid)) continue;

      const unitPrice =
        Number(itm.unitPrice !== undefined ? itm.unitPrice : itm.price) || 0;
      const qty = Number(itm.quantity) || 0;
      const lineRevenue = Math.round(unitPrice * qty * 100) / 100;
      const lineName = itm.productName || itm.name || "";

      if (!productSales.has(mid)) {
        productSales.set(mid, {
          name: lineName,
          units: qty,
          revenue: lineRevenue,
        });
      } else {
        const cur = productSales.get(mid);
        if (!cur.name && lineName) {
          cur.name = lineName;
        }
        cur.units += qty;
        cur.revenue = Math.round((cur.revenue + lineRevenue) * 100) / 100;
      }
    }
  }

  let categoryPaths = new Map();
  let itemNames = new Map();
  if (productSales.size > 0) {
    const res = await fetchCategoryPaths();
    categoryPaths = res.pathsMap;
    itemNames = res.namesMap;
  }

  const sortedProducts = Array.from(productSales.entries())
    .sort((a, b) => {
      if (b[1].revenue !== a[1].revenue) {
        return b[1].revenue - a[1].revenue;
      }
      if (b[1].units !== a[1].units) {
        return b[1].units - a[1].units;
      }
      return a[0] - b[0];
    })
    .slice(0, 5);

  const topSellingProducts = sortedProducts.map(([menuItemId, data], index) => ({
    rank: index + 1,
    menuItemId,
    productName: data.name || itemNames.get(menuItemId) || `Item #${menuItemId}`,
    categoryPath: categoryPaths.get(menuItemId) || "Uncategorized",
    unitsSold: data.units,
    grossSales: data.revenue,
  }));

  const summary = {
    periodTitle: periodMeta.title,
    periodId: normalizedPeriodId,
    grossRevenue: gross,
    totalRefunds: refundsTotal,
    netRevenue,
    totalOrders,
    averageOrderValue,
    refundCount,
    refundRate,
    hourlyVelocity,
    paymentMethodBreakdown,
    orderTypeBreakdown,
    topSellingProducts,
  };

  reportCache.set(normalizedPeriodId, {
    summary,
    timestamp: now,
    hitSafetyLimit,
  });

  return { summary, hitSafetyLimit, isCached: false };
}

/**
 * Builds CSV content string conforming to desktop ReportExportService.cs format.
 */
export function generateSalesCsv(summary) {
  const lines = [];

  const now = new Date();
  const yyyy = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const dateFormatted = `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;

  lines.push("BLOCK XI CAFÉ - SALES ANALYTICS & PERFORMANCE REPORT");
  lines.push(`Report Period: ${summary.periodTitle}`);
  lines.push(`Generated: ${dateFormatted}`);
  lines.push("");

  lines.push("--- FINANCIAL OVERVIEW ---");
  lines.push("Metric,Value");
  lines.push(`Gross Revenue,₱${summary.grossRevenue.toFixed(2)}`);
  lines.push(`Total Refunds,-₱${summary.totalRefunds.toFixed(2)}`);
  lines.push(`Net Revenue,₱${summary.netRevenue.toFixed(2)}`);
  lines.push(`Total Orders,${summary.totalOrders}`);
  lines.push(`Average Order Value (AOV),₱${summary.averageOrderValue.toFixed(2)}`);
  lines.push(`Refund Transactions,${summary.refundCount}`);
  lines.push(`Refund Rate,${summary.refundRate.toFixed(1)}%`);
  lines.push("");

  lines.push("--- PAYMENT METHOD BREAKDOWN ---");
  lines.push("Payment Method,Order Count,Gross Amount,Percentage");
  for (const pm of summary.paymentMethodBreakdown) {
    lines.push(
      `"${pm.label}",${pm.orderCount},₱${pm.totalAmount.toFixed(2)},${pm.percentage.toFixed(1)}%`
    );
  }
  lines.push("");

  lines.push("--- ORDER TYPE BREAKDOWN ---");
  lines.push("Order Type,Order Count,Gross Amount,Percentage");
  for (const ot of summary.orderTypeBreakdown) {
    lines.push(
      `"${ot.label}",${ot.orderCount},₱${ot.totalAmount.toFixed(2)},${ot.percentage.toFixed(1)}%`
    );
  }
  lines.push("");

  lines.push("--- TOP 5 BEST SELLING PRODUCTS ---");
  lines.push("Rank,Product Name,Category Path,Units Sold,Gross Sales");
  for (const top of summary.topSellingProducts) {
    const csvName = String(top.productName || "").replace(/"/g, '""');
    const csvPath = String(top.categoryPath || "").replace(/"/g, '""');
    lines.push(
      `${top.rank},"${csvName}","${csvPath}",${top.unitsSold},₱${top.grossSales.toFixed(2)}`
    );
  }
  lines.push("");

  lines.push("--- HOURLY SALES VELOCITY ---");
  lines.push("Time Window,Sales Amount");
  for (const vel of summary.hourlyVelocity) {
    lines.push(`"${vel.timeLabel}",₱${vel.amount.toFixed(2)}`);
  }

  return lines.join("\r\n");
}

/**
 * Triggers a browser download of the CSV report.
 * Uses the period title with spaces replaced by underscores, e.g. BlockXI_Sales_Daily_Summary_yyyyMMdd_HHmmss.csv.
 */
export function downloadSalesCsv(summary) {
  const csvContent = generateSalesCsv(summary);
  const now = new Date();
  const yyyy = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  const periodTitleSlug = (summary.periodTitle || "Sales_Summary").replace(/\s+/g, "_");
  const filename = `BlockXI_Sales_${periodTitleSlug}_${yyyy}${MM}${dd}_${HH}${mm}${ss}.csv`;

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
