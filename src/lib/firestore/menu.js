import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";

const CATEGORIES_COLLECTION = "categories";
const MENU_ITEMS_COLLECTION = "menuItems";
const COUNTERS_COLLECTION = "counters";

/**
 * Live subscription to categories.
 * Read-only on the web.
 */
export function subscribeToCategories(onChange, onError) {
  const categoriesRef = collection(db, CATEGORIES_COLLECTION);
  return onSnapshot(
    categoriesRef,
    (snapshot) => {
      const categories = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const subCats = Array.isArray(data.subCategories)
            ? [...data.subCategories].sort(
                (a, b) => (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0)
              )
            : [];
          return {
            id: docSnap.id,
            numericId: Number(docSnap.id),
            ...data,
            subCategories: subCats,
          };
        })
        .sort((a, b) => (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0));
      onChange(categories);
    },
    onError
  );
}

/**
 * Live subscription to active menu items.
 */
export function subscribeToMenuItems(onChange, onError) {
  const menuQuery = query(
    collection(db, MENU_ITEMS_COLLECTION),
    where("isActive", "==", true)
  );

  return onSnapshot(
    menuQuery,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        numericId: Number(docSnap.id),
        ...docSnap.data(),
      }));
      onChange(items);
    },
    onError
  );
}

/**
 * Queries for highest SKU starting with prefix- and generates the next SKU.
 * Format: "PREFIX-007".
 * Range query: sku >= "PREFIX-" and sku < "PREFIX."
 */
export async function generateNextSku(skuPrefix) {
  const prefix = (skuPrefix || "ITEM").toUpperCase().trim();
  const lowerBound = `${prefix}-`;
  const upperBound = `${prefix}.`;

  const q = query(
    collection(db, MENU_ITEMS_COLLECTION),
    where("sku", ">=", lowerBound),
    where("sku", "<", upperBound)
  );

  const snapshot = await getDocs(q);
  let maxNumber = 0;
  const regex = new RegExp(`^${prefix}-(\\d+)$`, "i");

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.sku) {
      const match = data.sku.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }
  });

  const nextNumber = maxNumber + 1;
  const digits = String(nextNumber).padStart(3, "0");
  return `${prefix}-${digits}`;
}

/**
 * Checks if a SKU already exists, excluding a specific item ID (for edits).
 */
export async function checkSkuExists(sku, excludeItemId = null) {
  const cleanSku = (sku || "").trim();
  if (!cleanSku) return false;

  const q = query(
    collection(db, MENU_ITEMS_COLLECTION),
    where("sku", "==", cleanSku)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.some((docSnap) => docSnap.id !== String(excludeItemId));
}

/**
 * Formats size in oz without trailing zeros (up to 2 decimal places, matching desktop C# FormatOz).
 */
export function formatSizeOz(sizeOz) {
  const num = Number(sizeOz);
  if (isNaN(num)) return "0";
  return parseFloat(num.toFixed(2)).toString();
}

/**
 * Normalizes temperature string to "Hot" or "Cold".
 */
export function normalizeVariantTemperature(temperature) {
  const t = String(temperature || "").trim().toLowerCase();
  if (t === "hot") return "Hot";
  if (t === "cold" || t === "iced") return "Cold";
  return "";
}

/**
 * Generates a stable key for a variant matching desktop POS: `${temperature}|${sizeOz}`.
 */
export function makeVariantKey(temperature, sizeOz) {
  const temp = normalizeVariantTemperature(temperature);
  const oz = formatSizeOz(sizeOz);
  return `${temp}|${oz}`;
}

/**
 * Prepares the payload for Firestore according to the strict data contract.
 */
export function prepareMenuItemPayload(itemData, isUpdate = false) {
  const isTakeOutBox = itemData.skuPrefix === "TOB";
  const hasSizeOptions = Boolean(itemData.hasSizeOptions);
  const tempRule = itemData.temperatureRule || "None";

  // Clean recipe rows
  const cleanIngredients = isTakeOutBox
    ? []
    : (itemData.ingredients || [])
        .filter((ing) => Number(ing.rawMaterialId) > 0 && Number(ing.quantityNeeded) > 0)
        .map((ing) => {
          const row = {
            rawMaterialId: Number(ing.rawMaterialId),
            quantityNeeded: Number(ing.quantityNeeded),
          };
          const applies = ing.appliesTo === "Iced" ? "Cold" : ing.appliesTo;
          if (tempRule === "Optional") {
            if (applies === "Hot" || applies === "Cold") {
              row.appliesTo = applies;
            }
          } else if (tempRule === "ColdOnly") {
            if (applies === "Cold") {
              row.appliesTo = "Cold";
            } else if (applies === "Hot") {
              throw new Error("Cannot save Hot recipe row for ColdOnly item.");
            }
          } else if (applies === "Hot" || applies === "Cold") {
            // NEVER silently turn Hot/Cold rows into "All" rows: reject if not Optional/ColdOnly
            throw new Error(
              `Cannot save Hot/Cold recipe row for item with temperature rule ${tempRule}.`
            );
          }
          return row;
        });

  let finalPrice = 0;
  let finalHotPrice = null;
  let finalColdPrice = null;
  let finalVariants = undefined;

  if (hasSizeOptions && Array.isArray(itemData.variants) && itemData.variants.length > 0) {
    finalHotPrice = null;
    finalColdPrice = null;

    // Process & sort variants: Hot first, then by sizeOz
    const sortedVariants = itemData.variants
      .filter((v) => Number(v.sizeOz) > 0 && Number(v.price) >= 0)
      .map((v) => ({
        temperature: v.temperature === "Iced" || v.temperature === "Cold" ? "Cold" : "Hot",
        sizeOz: Number(v.sizeOz),
        price: Number(v.price) || 0,
        isDefault: Boolean(v.isDefault),
        ingredients: (v.ingredients || [])
          .filter((ing) => Number(ing.rawMaterialId) > 0 && Number(ing.quantityNeeded) > 0)
          .map((ing) => ({
            rawMaterialId: Number(ing.rawMaterialId),
            quantityNeeded: Number(ing.quantityNeeded),
          })),
      }))
      .sort((a, b) => {
        if (a.temperature !== b.temperature) {
          return a.temperature === "Hot" ? -1 : 1;
        }
        return a.sizeOz - b.sizeOz;
      });

    // Guarantee exactly one default: keep only the first flagged size as default; if none is flagged, use the cheapest.
    let defaultIndex = sortedVariants.findIndex((v) => v.isDefault);
    if (defaultIndex === -1 && sortedVariants.length > 0) {
      defaultIndex = 0;
      for (let i = 1; i < sortedVariants.length; i++) {
        if (sortedVariants[i].price < sortedVariants[defaultIndex].price) {
          defaultIndex = i;
        }
      }
    }

    finalVariants = sortedVariants.map((v, idx) => ({
      ...v,
      isDefault: idx === defaultIndex,
    }));

    const prices = finalVariants.map((v) => v.price);
    finalPrice = prices.length > 0 ? Math.min(...prices) : 0;
  } else {
    // Unsized items
    if (tempRule === "None") {
      finalHotPrice = null;
      finalColdPrice = null;
      finalPrice = Number(itemData.price) || 0;
    } else if (tempRule === "ColdOnly") {
      finalHotPrice = null;
      finalColdPrice = Number(itemData.coldPrice) || 0;
      finalPrice = finalColdPrice;
    } else if (tempRule === "Optional") {
      const hPrice = itemData.hotPrice !== "" && itemData.hotPrice !== null ? Number(itemData.hotPrice) : null;
      const cPrice = itemData.coldPrice !== "" && itemData.coldPrice !== null ? Number(itemData.coldPrice) : null;
      finalHotPrice = hPrice;
      finalColdPrice = cPrice;
      const validPrices = [hPrice, cPrice].filter((p) => p !== null && p > 0);
      finalPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
    }
  }

  const payload = {
    sku: String(itemData.sku || "").trim(),
    name: String(itemData.name || "").trim(),
    description: String(itemData.description || "").trim(),
    categoryId: Number(itemData.categoryId),
    subCategoryId:
      itemData.subCategoryId !== null && itemData.subCategoryId !== undefined && itemData.subCategoryId !== ""
        ? Number(itemData.subCategoryId)
        : null,
    price: finalPrice,
    hotPrice: finalHotPrice,
    coldPrice: finalColdPrice,
    imageUrl: itemData.imageUrl || null,
    ingredients: cleanIngredients,
  };

  if (hasSizeOptions) {
    payload.variants = finalVariants || [];
  } else if (isUpdate) {
    // Remove variants field if item was converted from sized to unsized
    payload.variants = deleteField();
  }

  return payload;
}

/**
 * CREATE a menu item via atomic transaction using counters/menuItemId.
 */
export async function createMenuItem(itemData) {
  const counterRef = doc(db, COUNTERS_COLLECTION, "menuItemId");

  return runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    let currentVal = 0;
    if (counterSnap.exists()) {
      currentVal = Number(counterSnap.data()?.value) || 0;
    }

    const newId = currentVal + 1;
    const newIdStr = String(newId);
    const itemRef = doc(db, MENU_ITEMS_COLLECTION, newIdStr);

    const existingSnap = await transaction.get(itemRef);
    if (existingSnap.exists()) {
      throw new Error(`Menu item with ID ${newIdStr} already exists. Please retry.`);
    }

    transaction.set(counterRef, { value: newId }, { merge: true });
    transaction.set(itemRef, {
      ...prepareMenuItemPayload(itemData, false),
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return newIdStr;
  });
}

/**
 * UPDATE an existing menu item with full field set and updatedAt.
 * Leaves createdAt and isActive untouched.
 */
export async function updateMenuItem(itemId, itemData) {
  const itemRef = doc(db, MENU_ITEMS_COLLECTION, String(itemId));
  await updateDoc(itemRef, {
    ...prepareMenuItemPayload(itemData, true),
    updatedAt: serverTimestamp(),
  });
}

/**
 * DEACTIVATE (soft delete) a menu item.
 * Sets isActive = false and updatedAt.
 */
export async function deactivateMenuItem(itemId) {
  const itemRef = doc(db, MENU_ITEMS_COLLECTION, String(itemId));
  await updateDoc(itemRef, {
    isActive: false,
    updatedAt: serverTimestamp(),
  });
}
