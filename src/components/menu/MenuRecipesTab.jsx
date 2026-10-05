import { useState, useEffect, useMemo, useRef } from "react";
import {
  subscribeToCategories,
  subscribeToMenuItems,
  deactivateMenuItem,
} from "../../lib/firestore/menu";
import { subscribeToMaterials } from "../../lib/firestore/rawMaterials";
import { MenuItemEditorModal } from "./MenuItemEditorModal";
import { DeactivateConfirmModal } from "./DeactivateConfirmModal";
import { Toast } from "../inventory/Toast";
import { formatCurrency } from "../../lib/constants";

export default function MenuRecipesTab() {
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);

  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingMats, setLoadingMats] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedCatId, setSelectedCatId] = useState("All");
  const [selectedSubCatId, setSelectedSubCatId] = useState("All");
  const [search, setSearch] = useState("");
  const [activeBannerFilter, setActiveBannerFilter] = useState(null); // null | "missing_subcat" | "needs_pricing"

  // Editor Modal State
  const [editorState, setEditorState] = useState({
    open: false,
    mode: "add",
    item: null,
  });

  // Deactivate Modal State
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivating, setDeactivating] = useState(false);

  // Toast
  const [toast, setToast] = useState("");

  const catPillRefs = useRef({});
  const subCatPillRefs = useRef({});

  // 1. Live Firestore Subscriptions
  useEffect(() => {
    const unsubCats = subscribeToCategories(
      (data) => {
        setCategories(data);
        setLoadingCats(false);
      },
      () => {
        setErrorMsg("Failed to load menu categories. Check your connection.");
        setLoadingCats(false);
      }
    );

    const unsubItems = subscribeToMenuItems(
      (data) => {
        setMenuItems(data);
        setLoadingItems(false);
      },
      () => {
        setErrorMsg("Failed to load menu items.");
        setLoadingItems(false);
      }
    );

    const unsubMats = subscribeToMaterials(
      (data) => {
        setRawMaterials(data);
        setLoadingMats(false);
      },
      () => {
        setErrorMsg("Failed to load raw materials.");
        setLoadingMats(false);
      }
    );

    return () => {
      unsubCats();
      unsubItems();
      unsubMats();
    };
  }, []);

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Map raw materials by numeric ID for cost calculation
  const materialsMap = useMemo(() => {
    const map = new Map();
    rawMaterials.forEach((m) => {
      const numId = Number(m.id);
      if (!isNaN(numId)) {
        map.set(numId, m);
      }
    });
    return map;
  }, [rawMaterials]);

  // Categories map by numeric ID
  const categoriesMap = useMemo(() => {
    const map = new Map();
    categories.forEach((c) => {
      map.set(Number(c.numericId), c);
    });
    return map;
  }, [categories]);

  // Current category's sub-categories
  const currentCategory = useMemo(() => {
    if (selectedCatId === "All") return null;
    return categories.find((c) => String(c.numericId) === String(selectedCatId)) || null;
  }, [categories, selectedCatId]);

  const currentSubCategories = useMemo(() => {
    return currentCategory?.subCategories || [];
  }, [currentCategory]);

  // Auto-scroll selected category pill into view
  useEffect(() => {
    const el = catPillRefs.current[selectedCatId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedCatId]);

  // Auto-scroll selected subcategory pill into view
  useEffect(() => {
    const el = subCatPillRefs.current[selectedSubCatId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedSubCatId]);

  // Calculate helpers for an item: Category Path, Price String, Recipe Cost, Margin %
  function getItemMetrics(item) {
    const cat = categoriesMap.get(Number(item.categoryId));
    const subCat = (cat?.subCategories || []).find(
      (sc) => Number(sc.subCategoryId) === Number(item.subCategoryId)
    );

    const categoryPath = subCat ? `${cat?.name} > ${subCat.name}` : cat?.name || "Uncategorized";

    const hasSizes = Array.isArray(item.variants) && item.variants.length > 0;
    const isTakeOutBox = cat?.skuPrefix === "TOB";

    // Pricing text
    let priceDisplay;
    if (hasSizes) {
      const prices = item.variants.map((v) => Number(v.price) || 0);
      const minPrice = Math.min(...prices);
      priceDisplay = `From ${formatCurrency(minPrice)}`;
    } else {
      const tempRule = subCat?.temperatureRule || "None";
      if (tempRule === "Optional") {
        const parts = [];
        if (item.hotPrice !== null && item.hotPrice !== undefined && item.hotPrice > 0) {
          parts.push(`Hot ${formatCurrency(item.hotPrice)}`);
        }
        if (item.coldPrice !== null && item.coldPrice !== undefined && item.coldPrice > 0) {
          parts.push(`Iced ${formatCurrency(item.coldPrice)}`);
        }
        priceDisplay = parts.length > 0 ? parts.join(" / ") : formatCurrency(item.price || 0);
      } else if (tempRule === "ColdOnly") {
        priceDisplay = item.coldPrice ? `Iced ${formatCurrency(item.coldPrice)}` : formatCurrency(item.price || 0);
      } else {
        priceDisplay = formatCurrency(item.price || 0);
      }
    }

    // Recipe Cost & Margin calculation
    let costDisplay = "—";
    let marginDisplay = "—";
    let isLowMargin = false;

    if (isTakeOutBox) {
      costDisplay = "Packaging";
      marginDisplay = "100%";
    } else if (hasSizes) {
      // Calculate costs across sizes
      const sizeCosts = item.variants.map((v) => {
        return (v.ingredients || []).reduce((sum, ing) => {
          const mat = materialsMap.get(Number(ing.rawMaterialId));
          return sum + Number(ing.quantityNeeded) * (Number(mat?.costPerUnit) || 0);
        }, 0);
      });
      const minCost = Math.min(...sizeCosts);
      const maxCost = Math.max(...sizeCosts);
      costDisplay = minCost === maxCost ? formatCurrency(minCost) : `${formatCurrency(minCost)}–${formatCurrency(maxCost)}`;

      // Approximate margin using default or first size
      const defaultVariant = item.variants.find((v) => v.isDefault) || item.variants[0];
      if (defaultVariant) {
        const dPrice = Number(defaultVariant.price) || 0;
        const dCost = (defaultVariant.ingredients || []).reduce((sum, ing) => {
          const mat = materialsMap.get(Number(ing.rawMaterialId));
          return sum + Number(ing.quantityNeeded) * (Number(mat?.costPerUnit) || 0);
        }, 0);
        if (dPrice > 0) {
          const m = ((dPrice - dCost) / dPrice) * 100;
          marginDisplay = `${m.toFixed(0)}%`;
          isLowMargin = m < 40;
        }
      }
    } else if (Array.isArray(item.ingredients) && item.ingredients.length > 0) {
      const totalCost = item.ingredients.reduce((sum, ing) => {
        const mat = materialsMap.get(Number(ing.rawMaterialId));
        return sum + Number(ing.quantityNeeded) * (Number(mat?.costPerUnit) || 0);
      }, 0);

      costDisplay = formatCurrency(totalCost);
      const sellingPrice = Number(item.price) || 0;
      if (sellingPrice > 0) {
        const marginVal = ((sellingPrice - totalCost) / sellingPrice) * 100;
        marginDisplay = `${marginVal.toFixed(0)}%`;
        isLowMargin = marginVal < 40;
      }
    }

    return {
      cat,
      subCat,
      categoryPath,
      priceDisplay,
      costDisplay,
      marginDisplay,
      isLowMargin,
    };
  }

  // Warning Banners Detection
  // Banner 1: Category has sub-categories, but item has no valid subCategoryId set
  const itemsMissingSubCategory = useMemo(() => {
    return menuItems.filter((item) => {
      const cat = categoriesMap.get(Number(item.categoryId));
      const hasSubCats = Array.isArray(cat?.subCategories) && cat.subCategories.length > 0;
      if (!hasSubCats) return false;

      const subCat = cat.subCategories.find(
        (sc) => Number(sc.subCategoryId) === Number(item.subCategoryId)
      );
      return !subCat;
    });
  }, [menuItems, categoriesMap]);

  // Banner 2: Drinks that still need Hot/Cold temperature pricing (NeedsTemperaturePricing)
  const itemsNeedingTemperaturePricing = useMemo(() => {
    return menuItems.filter((item) => {
      const cat = categoriesMap.get(Number(item.categoryId));
      const subCat = (cat?.subCategories || []).find(
        (sc) => Number(sc.subCategoryId) === Number(item.subCategoryId)
      );
      const tempRule = subCat?.temperatureRule || "None";
      const hasSizes = Array.isArray(item.variants) && item.variants.length > 0;

      if (hasSizes) {
        return item.variants.some((v) => Number(v.price) <= 0);
      }

      if (tempRule === "Optional") {
        const hasHot = item.hotPrice !== null && item.hotPrice !== undefined && Number(item.hotPrice) > 0;
        const hasCold = item.coldPrice !== null && item.coldPrice !== undefined && Number(item.coldPrice) > 0;
        return !hasHot && !hasCold;
      }

      if (tempRule === "ColdOnly") {
        return !item.coldPrice || Number(item.coldPrice) <= 0;
      }

      return false;
    });
  }, [menuItems, categoriesMap]);

  // Filter items by category, sub-category, search, and banner filters
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return menuItems.filter((item) => {
      // Banner filter override
      if (activeBannerFilter === "missing_subcat") {
        if (!itemsMissingSubCategory.some((m) => m.id === item.id)) return false;
      } else if (activeBannerFilter === "needs_pricing") {
        if (!itemsNeedingTemperaturePricing.some((m) => m.id === item.id)) return false;
      }

      // Category filter
      if (selectedCatId !== "All") {
        if (String(item.categoryId) !== String(selectedCatId)) return false;
      }

      // Sub-category filter
      if (selectedSubCatId !== "All") {
        if (String(item.subCategoryId) !== String(selectedSubCatId)) return false;
      }

      // Search filter: matches name, SKU, or "Category > Sub-category"
      if (q) {
        const cat = categoriesMap.get(Number(item.categoryId));
        const subCat = (cat?.subCategories || []).find(
          (sc) => Number(sc.subCategoryId) === Number(item.subCategoryId)
        );
        const catPath = subCat ? `${cat?.name} > ${subCat.name}` : cat?.name || "";
        const combined = `${item.name || ""} ${item.sku || ""} ${catPath}`.toLowerCase();
        if (!combined.includes(q)) return false;
      }

      return true;
    });
  }, [
    menuItems,
    selectedCatId,
    selectedSubCatId,
    search,
    activeBannerFilter,
    itemsMissingSubCategory,
    itemsNeedingTemperaturePricing,
    categoriesMap,
  ]);

  // Deactivate handler
  async function handleConfirmDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await deactivateMenuItem(deactivateTarget.id);
      setToast(`✓ "${deactivateTarget.name}" deactivated`);
      setDeactivateTarget(null);
      setEditorState({ open: false, mode: "add", item: null });
    } catch {
      setToast("❌ Failed to deactivate menu item. Try again.");
    } finally {
      setDeactivating(false);
    }
  }

  const isLoading = loadingCats || loadingItems || loadingMats;

  return (
    <div className="space-y-6">
      {/* ── Category Pills (POS Counter Style) ── */}
      <section className="mt-4 sm:mt-6">
        <div className="no-scrollbar flex flex-nowrap items-center gap-2.5 overflow-x-auto py-1 sm:gap-3 lg:flex-wrap">
          {/* "All" Category Pill */}
          <button
            ref={(el) => (catPillRefs.current["All"] = el)}
            type="button"
            onClick={() => {
              setSelectedCatId("All");
              setSelectedSubCatId("All");
              setActiveBannerFilter(null);
            }}
            className={`flex min-h-[52px] sm:min-h-[56px] shrink-0 cursor-pointer items-center justify-center rounded-full px-6 text-sm font-semibold whitespace-nowrap transition-all duration-150 sm:text-base ${
              selectedCatId === "All" && !activeBannerFilter
                ? "border border-ink bg-ink text-paper shadow-xs"
                : "border border-line bg-surface text-ink-soft hover:bg-paper/70 hover:text-ink"
            }`}
          >
            All Items
          </button>

          {/* Individual Category Pills */}
          {categories.map((cat) => {
            const isSelected = selectedCatId === String(cat.numericId) && !activeBannerFilter;
            return (
              <button
                key={cat.id}
                ref={(el) => (catPillRefs.current[String(cat.numericId)] = el)}
                type="button"
                onClick={() => {
                  setSelectedCatId(String(cat.numericId));
                  setSelectedSubCatId("All");
                  setActiveBannerFilter(null);
                }}
                className={`flex min-h-[52px] sm:min-h-[56px] shrink-0 cursor-pointer items-center justify-center rounded-full px-6 text-sm font-semibold whitespace-nowrap transition-all duration-150 sm:text-base ${
                  isSelected
                    ? "border border-ink bg-ink text-paper shadow-xs"
                    : "border border-line bg-surface text-ink-soft hover:bg-paper/70 hover:text-ink"
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* ── Sub-Category Pills (for Selected Category) ── */}
        {currentSubCategories.length > 0 && (
          <div className="no-scrollbar mt-3 flex flex-nowrap items-center gap-2 overflow-x-auto py-1 sm:gap-2.5 lg:flex-wrap">
            <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider shrink-0 mr-1">
              Sub-categories:
            </span>

            <button
              ref={(el) => (subCatPillRefs.current["All"] = el)}
              type="button"
              onClick={() => setSelectedSubCatId("All")}
              className={`flex min-h-[42px] shrink-0 cursor-pointer items-center justify-center rounded-full px-4 text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                selectedSubCatId === "All"
                  ? "border border-ink bg-ink text-paper"
                  : "border border-line bg-surface text-ink-soft hover:bg-paper"
              }`}
            >
              All {currentCategory.name}
            </button>

            {currentSubCategories.map((sc) => {
              const isSelected = selectedSubCatId === String(sc.subCategoryId);
              return (
                <button
                  key={sc.subCategoryId}
                  ref={(el) => (subCatPillRefs.current[String(sc.subCategoryId)] = el)}
                  type="button"
                  onClick={() => setSelectedSubCatId(String(sc.subCategoryId))}
                  className={`flex min-h-[42px] shrink-0 cursor-pointer items-center justify-center rounded-full px-4 text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                    isSelected
                      ? "border border-ink bg-ink text-paper"
                      : "border border-line bg-surface text-ink-soft hover:bg-paper"
                  }`}
                >
                  {sc.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Warning Banners (Desktop POS Parity) ── */}
      {(itemsMissingSubCategory.length > 0 || itemsNeedingTemperaturePricing.length > 0) && (
        <section className="space-y-3">
          {/* Missing Subcategory Banner */}
          {itemsMissingSubCategory.length > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-800">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {itemsMissingSubCategory.length} item{itemsMissingSubCategory.length === 1 ? "" : "s"} missing a sub-category assignment
                  </p>
                  <p className="text-xs text-amber-800/80">
                    These items belong to categories with sub-categories but don&rsquo;t have one selected.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() =>
                    setActiveBannerFilter(
                      activeBannerFilter === "missing_subcat" ? null : "missing_subcat"
                    )
                  }
                  className="min-h-[44px] rounded-lg bg-amber-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-900 transition"
                >
                  {activeBannerFilter === "missing_subcat" ? "Show All Items" : "View Items"}
                </button>
              </div>
            </div>
          )}

          {/* Missing Temperature Pricing Banner */}
          {itemsNeedingTemperaturePricing.length > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-blue-300 bg-blue-50 p-4 text-blue-900">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-200 text-blue-800">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {itemsNeedingTemperaturePricing.length} drink{itemsNeedingTemperaturePricing.length === 1 ? "" : "s"} need temperature pricing
                  </p>
                  <p className="text-xs text-blue-800/80">
                    Items governed by Hot/Cold rules that are missing required hot or iced selling prices.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() =>
                    setActiveBannerFilter(
                      activeBannerFilter === "needs_pricing" ? null : "needs_pricing"
                    )
                  }
                  className="min-h-[44px] rounded-lg bg-blue-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-900 transition"
                >
                  {activeBannerFilter === "needs_pricing" ? "Show All Items" : "Fix Pricing"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Search Bar & Action Button ── */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items by name, SKU, or category…"
            className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink text-xs p-1"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {activeBannerFilter && (
            <button
              onClick={() => setActiveBannerFilter(null)}
              className="min-h-[44px] rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-soft hover:text-ink"
            >
              Clear Filter ({activeBannerFilter === "missing_subcat" ? "Missing Subcat" : "Needs Pricing"})
            </button>
          )}

          <button
            onClick={() => setEditorState({ open: true, mode: "add", item: null })}
            className="min-h-[44px] w-full sm:w-auto rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-ink/90 active:scale-95 shadow-xs"
          >
            + New Item
          </button>
        </div>
      </section>

      {/* Error Banner */}
      {errorMsg && (
        <div className="rounded-xl bg-alert-soft p-4 text-sm text-alert border border-alert/20">
          {errorMsg}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-ink-soft">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-ink border-r-transparent mb-3" />
          <p>Loading menu items and recipes…</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-paper text-ink-soft mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h3 className="font-semibold text-ink text-base">No Menu Items Found</h3>
          <p className="mt-1 text-sm text-ink-soft max-w-sm mx-auto">
            {search || selectedCatId !== "All" || activeBannerFilter
              ? "No items match your active filters. Try adjusting your search or category."
              : "No active items in the menu. Click \"+ New Item\" to create your first menu offering."}
          </p>
          {(search || selectedCatId !== "All" || activeBannerFilter) && (
            <button
              onClick={() => {
                setSearch("");
                setSelectedCatId("All");
                setSelectedSubCatId("All");
                setActiveBannerFilter(null);
              }}
              className="mt-4 text-xs font-semibold text-accent hover:underline"
            >
              Reset all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Mobile Single-Column Cards (md:hidden) ── */}
          <div className="space-y-3 md:hidden">
            {filteredItems.map((item) => {
              const { categoryPath, priceDisplay, costDisplay, marginDisplay, isLowMargin } =
                getItemMetrics(item);

              return (
                <div
                  key={item.id}
                  onClick={() => setEditorState({ open: true, mode: "edit", item })}
                  className="rounded-2xl border border-line bg-surface p-4 shadow-xs hover:border-accent transition cursor-pointer active:bg-paper/40"
                >
                  <div className="flex items-start gap-3">
                    {/* Photo thumbnail */}
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-14 w-14 shrink-0 rounded-xl object-cover border border-line"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-paper border border-line text-ink-soft">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                          <line x1="6" y1="1" x2="6" y2="4" />
                          <line x1="10" y1="1" x2="10" y2="4" />
                          <line x1="14" y1="1" x2="14" y2="4" />
                        </svg>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-semibold text-ink truncate text-base">{item.name}</h4>
                        <span className="font-mono text-xs text-ink-soft shrink-0">{item.sku}</span>
                      </div>
                      <p className="text-xs text-ink-soft truncate mt-0.5">{categoryPath}</p>
                      <p className="mt-1 font-semibold text-ink text-sm">{priceDisplay}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line/60 pt-2.5 text-xs">
                    <div>
                      <span className="text-ink-soft">Recipe Cost: </span>
                      <span className="font-medium tabular-figures text-ink">{costDisplay}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-ink-soft">Margin: </span>
                      <span
                        className={`font-bold tabular-figures ${
                          isLowMargin ? "text-alert" : "text-accent"
                        }`}
                      >
                        {marginDisplay}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Tablet 2-Column Grid (hidden md:grid lg:hidden) ── */}
          <div className="hidden md:grid lg:hidden grid-cols-2 gap-4">
            {filteredItems.map((item) => {
              const { categoryPath, priceDisplay, costDisplay, marginDisplay, isLowMargin } =
                getItemMetrics(item);

              return (
                <div
                  key={item.id}
                  onClick={() => setEditorState({ open: true, mode: "edit", item })}
                  className="rounded-2xl border border-line bg-surface p-4 shadow-xs hover:border-accent transition cursor-pointer flex flex-col justify-between"
                >
                  <div className="flex items-start gap-3">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-16 w-16 shrink-0 rounded-xl object-cover border border-line"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-paper border border-line text-ink-soft">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                        </svg>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-ink-soft">{item.sku}</span>
                      </div>
                      <h4 className="font-semibold text-ink truncate text-base mt-0.5">{item.name}</h4>
                      <p className="text-xs text-ink-soft truncate">{categoryPath}</p>
                      <p className="mt-1 font-semibold text-ink text-sm">{priceDisplay}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-xs">
                    <div>
                      <span className="text-ink-soft">Cost: </span>
                      <span className="font-medium tabular-figures text-ink">{costDisplay}</span>
                    </div>
                    <div>
                      <span className="text-ink-soft">Margin: </span>
                      <span
                        className={`font-bold tabular-figures ${
                          isLowMargin ? "text-alert" : "text-accent"
                        }`}
                      >
                        {marginDisplay}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Desktop Full Table (hidden lg:block) ── */}
          <section className="hidden lg:block overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="border-b border-line bg-paper/50 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  <tr>
                    <th className="px-4 py-3.5">Photo</th>
                    <th className="px-4 py-3.5">Item &amp; SKU</th>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5 text-right">Price</th>
                    <th className="px-4 py-3.5 text-right">Recipe Cost</th>
                    <th className="px-4 py-3.5 text-right">Margin</th>
                    <th className="px-4 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredItems.map((item) => {
                    const { categoryPath, priceDisplay, costDisplay, marginDisplay, isLowMargin } =
                      getItemMetrics(item);

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setEditorState({ open: true, mode: "edit", item })}
                        className="hover:bg-paper/40 transition cursor-pointer"
                      >
                        {/* Photo */}
                        <td className="px-4 py-3 shrink-0">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-11 w-11 rounded-lg object-cover border border-line"
                            />
                          ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-paper border border-line text-ink-soft">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                              </svg>
                            </div>
                          )}
                        </td>

                        {/* Name & SKU */}
                        <td className="px-4 py-3">
                          <div className="font-semibold text-ink">{item.name}</div>
                          <div className="font-mono text-xs text-ink-soft">{item.sku}</div>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3 text-ink-soft text-xs">
                          {categoryPath}
                        </td>

                        {/* Selling Price */}
                        <td className="px-4 py-3 text-right font-medium tabular-figures text-ink">
                          {priceDisplay}
                        </td>

                        {/* Recipe Cost */}
                        <td className="px-4 py-3 text-right tabular-figures text-ink-soft">
                          {costDisplay}
                        </td>

                        {/* Margin */}
                        <td className="px-4 py-3 text-right tabular-figures">
                          <span
                            className={`font-semibold ${
                              isLowMargin ? "text-alert" : "text-accent"
                            }`}
                          >
                            {marginDisplay}
                          </span>
                        </td>

                        {/* Edit Button */}
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setEditorState({ open: true, mode: "edit", item })}
                            className="min-h-[36px] rounded-lg border border-line px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-paper transition"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ── Menu Item Editor Modal ── */}
      <MenuItemEditorModal
        open={editorState.open}
        mode={editorState.mode}
        item={editorState.item}
        categories={categories}
        rawMaterials={rawMaterials}
        onClose={() => setEditorState({ open: false, mode: "add", item: null })}
        onSaved={(msg) => {
          setToast(msg);
          setEditorState({ open: false, mode: "add", item: null });
        }}
        onDeactivate={(target) => {
          setDeactivateTarget(target);
        }}
      />

      {/* ── Deactivate Item Confirmation Modal ── */}
      <DeactivateConfirmModal
        open={Boolean(deactivateTarget)}
        itemName={deactivateTarget?.name}
        loading={deactivating}
        onConfirm={handleConfirmDeactivate}
        onClose={() => setDeactivateTarget(null)}
      />

      {/* Toast Feedback */}
      <Toast message={toast} />
    </div>
  );
}
