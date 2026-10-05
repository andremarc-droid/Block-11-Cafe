import { useState, useEffect, useMemo, useRef } from "react";
import { MaterialPickerModal } from "./MaterialPickerModal";
import { processImageFile } from "../../lib/services/imageUtils";
import { formatCurrency } from "../../lib/constants";
import { formatQuantityWithUnit } from "../../lib/services/unitConversion";
import {
  createMenuItem,
  updateMenuItem,
  generateNextSku,
  checkSkuExists,
  makeVariantKey,
  normalizeVariantTemperature,
  formatSizeOz,
} from "../../lib/firestore/menu";

export function MenuItemEditorModal({
  open,
  mode = "add", // "add" | "edit"
  item = null,
  categories = [],
  rawMaterials = [],
  onClose,
  onSaved,
  onDeactivate,
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    categoryId: "",
    subCategoryId: "",
    sku: "",
    imageUrl: null,
    price: "",
    hotPrice: "",
    coldPrice: "",
    ingredients: [],
    variants: [],
  });

  const [saving, setSaving] = useState(false);
  const [generatingSku, setGeneratingSku] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [error, setError] = useState("");
  const [showRecipeWarning, setShowRecipeWarning] = useState(false);
  const [pendingSavePayload, setPendingSavePayload] = useState(null);

  // Material picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeSizeKeyForPicker, setActiveSizeKeyForPicker] = useState(null);

  // Size editing state
  const [newSizeForm, setNewSizeForm] = useState({
    temperature: "Cold",
    sizeOz: "",
    price: "",
    isDefault: false,
  });
  const [editingSizeKey, setEditingSizeKey] = useState(null);
  const [expandedSizeKey, setExpandedSizeKey] = useState(null);

  const fileInputRef = useRef(null);

  // Map raw materials by numeric ID for fast lookup
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

  // Selected Category
  const selectedCategory = useMemo(() => {
    if (!formData.categoryId) return null;
    return categories.find((c) => Number(c.numericId) === Number(formData.categoryId)) || null;
  }, [categories, formData.categoryId]);

  // Subcategories of selected category
  const subCategories = useMemo(() => {
    return selectedCategory?.subCategories || [];
  }, [selectedCategory]);

  // Selected Subcategory
  const selectedSubCategory = useMemo(() => {
    if (!formData.subCategoryId || !selectedCategory) return null;
    return (
      subCategories.find(
        (sc) => Number(sc.subCategoryId) === Number(formData.subCategoryId)
      ) || null
    );
  }, [subCategories, formData.subCategoryId, selectedCategory]);

  // Temperature rule & size options driven by selected subcategory
  const temperatureRule = useMemo(() => {
    if (selectedSubCategory?.temperatureRule) {
      return selectedSubCategory.temperatureRule;
    }
    return "None";
  }, [selectedSubCategory]);

  const hasSizeOptions = useMemo(() => {
    return Boolean(selectedSubCategory?.sizeOptions);
  }, [selectedSubCategory]);

  const isTakeOutBox = useMemo(() => {
    return selectedCategory?.skuPrefix === "TOB";
  }, [selectedCategory]);

  // Initialize or reset form when modal opens or item changes
  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && item) {
      setFormData({
        name: item.name || "",
        description: item.description || "",
        categoryId: item.categoryId ? String(item.categoryId) : "",
        subCategoryId: item.subCategoryId ? String(item.subCategoryId) : "",
        sku: item.sku || "",
        imageUrl: item.imageUrl || null,
        price: item.price !== null && item.price !== undefined ? String(item.price) : "",
        hotPrice: item.hotPrice !== null && item.hotPrice !== undefined ? String(item.hotPrice) : "",
        coldPrice: item.coldPrice !== null && item.coldPrice !== undefined ? String(item.coldPrice) : "",
        ingredients: Array.isArray(item.ingredients) ? [...item.ingredients] : [],
        variants: Array.isArray(item.variants)
          ? item.variants.map((v) => ({
              temperature: v.temperature === "Cold" ? "Iced" : v.temperature,
              sizeOz: String(v.sizeOz),
              price: String(v.price),
              isDefault: Boolean(v.isDefault),
              ingredients: Array.isArray(v.ingredients) ? [...v.ingredients] : [],
            }))
          : [],
      });
      setError("");
      setEditingSizeKey(null);
    } else {
      // Add mode default: subCategoryId is NOT pre-selected (set to "")
      const firstCat = categories[0];
      const initialCatId = firstCat ? String(firstCat.numericId) : "";

      setFormData({
        name: "",
        description: "",
        categoryId: initialCatId,
        subCategoryId: "", // Not pre-selected!
        sku: "",
        imageUrl: null,
        price: "",
        hotPrice: "",
        coldPrice: "",
        ingredients: [],
        variants: [],
      });
      setError("");
      setEditingSizeKey(null);

      if (firstCat?.skuPrefix) {
        setGeneratingSku(true);
        generateNextSku(firstCat.skuPrefix)
          .then((generated) => {
            setFormData((prev) => ({ ...prev, sku: generated }));
          })
          .catch(() => {})
          .finally(() => setGeneratingSku(false));
      }
    }
  }, [open, mode, item, categories]);

  // When category changes, clear subCategoryId and auto-generate new SKU in Add mode
  function handleCategoryChange(newCatId) {
    const cat = categories.find((c) => String(c.numericId) === String(newCatId));

    setFormData((prev) => ({
      ...prev,
      categoryId: newCatId,
      subCategoryId: "", // Cleared whenever category changes
    }));
    setEditingSizeKey(null);

    if (mode === "add" && cat?.skuPrefix) {
      setGeneratingSku(true);
      generateNextSku(cat.skuPrefix)
        .then((generated) => {
          setFormData((prev) => ({ ...prev, sku: generated }));
        })
        .catch(() => {})
        .finally(() => setGeneratingSku(false));
    }
  }

  // Handle Photo Upload
  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setImageProcessing(true);
    try {
      const dataUri = await processImageFile(file);
      setFormData((prev) => ({ ...prev, imageUrl: dataUri }));
    } catch (err) {
      setError(err.message || "Failed to process photo.");
    } finally {
      setImageProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemovePhoto() {
    setFormData((prev) => ({ ...prev, imageUrl: null }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Recipe Ingredient Addition / Replacement
  // In item recipe: identified by pair (rawMaterialId, appliesTo)
  // In size recipe: identified by rawMaterialId alone
  function handleAddIngredient(newIng) {
    if (activeSizeKeyForPicker !== null) {
      // Adding to a specific size variant (one row per material)
      setFormData((prev) => {
        const nextVariants = prev.variants.map((v) => {
          if (makeVariantKey(v.temperature, v.sizeOz) !== activeSizeKeyForPicker) {
            return v;
          }
          const currentIngs = v.ingredients || [];
          const filtered = currentIngs.filter(
            (ing) => Number(ing.rawMaterialId) !== Number(newIng.rawMaterialId)
          );
          return {
            ...v,
            ingredients: [
              ...filtered,
              {
                rawMaterialId: newIng.rawMaterialId,
                quantityNeeded: newIng.quantityNeeded,
              },
            ],
          };
        });
        return { ...prev, variants: nextVariants };
      });
    } else {
      // Adding to item recipe: identified by pair (rawMaterialId, appliesTo)
      const targetApplies = newIng.appliesTo || "All";
      setFormData((prev) => {
        const currentIngs = prev.ingredients || [];
        const nextIngs = currentIngs.filter((ing) => {
          const ingApplies = ing.appliesTo || "All";
          return !(
            Number(ing.rawMaterialId) === Number(newIng.rawMaterialId) &&
            ingApplies === targetApplies
          );
        });
        return {
          ...prev,
          ingredients: [...nextIngs, newIng],
        };
      });
    }
  }

  // Remove ingredient by pair (rawMaterialId, appliesTo)
  function handleRemoveIngredient(matId, appliesTo) {
    const targetApplies = appliesTo || "All";
    setFormData((prev) => ({
      ...prev,
      ingredients: (prev.ingredients || []).filter((ing) => {
        const ingApplies = ing.appliesTo || "All";
        return !(
          Number(ing.rawMaterialId) === Number(matId) &&
          ingApplies === targetApplies
        );
      }),
    }));
  }

  function handleRemoveSizeIngredient(variantKey, matId) {
    setFormData((prev) => {
      const nextVariants = prev.variants.map((v) => {
        if (makeVariantKey(v.temperature, v.sizeOz) !== variantKey) {
          return v;
        }
        return {
          ...v,
          ingredients: (v.ingredients || []).filter(
            (ing) => Number(ing.rawMaterialId) !== Number(matId)
          ),
        };
      });
      return { ...prev, variants: nextVariants };
    });
  }

  // Sizes Management: Add or Update Size
  function handleAddOrUpdateSize() {
    setError("");
    const oz = parseFloat(newSizeForm.sizeOz);
    const p = parseFloat(newSizeForm.price);

    if (isNaN(oz) || oz <= 0) {
      setError("Size in oz must be greater than zero.");
      return;
    }
    if (isNaN(p) || p < 0) {
      setError("Price cannot be negative.");
      return;
    }

    const temp = temperatureRule === "ColdOnly" ? "Iced" : newSizeForm.temperature;
    const newKey = makeVariantKey(temp, oz);

    // Duplicate check: ignore the size being edited!
    const exists = formData.variants.some((v) => {
      const vKey = makeVariantKey(v.temperature, v.sizeOz);
      return vKey !== editingSizeKey && vKey === newKey;
    });
    if (exists) {
      setError(`A size for ${temp} ${formatSizeOz(oz)} oz already exists.`);
      return;
    }

    if (editingSizeKey !== null) {
      const oldKey = editingSizeKey;
      const isMarkedDefault = Boolean(newSizeForm.isDefault);

      setFormData((prev) => {
        const next = prev.variants.map((v) => {
          const vKey = makeVariantKey(v.temperature, v.sizeOz);
          if (vKey === oldKey) {
            return {
              ...v,
              temperature: temp,
              sizeOz: formatSizeOz(oz),
              price: String(p),
              isDefault: isMarkedDefault,
            };
          }
          // When the updated size is marked default, set isDefault=false on every other size
          return isMarkedDefault ? { ...v, isDefault: false } : v;
        });

        // Ensure at least one default size exists
        let updated = next;
        if (updated.length > 0 && !updated.some((v) => v.isDefault)) {
          updated = updated.map((v, idx) => (idx === 0 ? { ...v, isDefault: true } : v));
        }

        return {
          ...prev,
          variants: updated.sort((a, b) => {
            const aTemp = normalizeVariantTemperature(a.temperature);
            const bTemp = normalizeVariantTemperature(b.temperature);
            if (aTemp !== bTemp) return aTemp === "Hot" ? -1 : 1;
            return parseFloat(a.sizeOz) - parseFloat(b.sizeOz);
          }),
        };
      });

      // If a size's own key changes while editing, update the stored key
      if (expandedSizeKey === oldKey) {
        setExpandedSizeKey(newKey);
      }
      if (activeSizeKeyForPicker === oldKey) {
        setActiveSizeKeyForPicker(newKey);
      }
      setEditingSizeKey(null);
    } else {
      // Adding new size
      const isFirst = formData.variants.length === 0;
      const isMarkedDefault = isFirst || Boolean(newSizeForm.isDefault);

      setFormData((prev) => {
        // When the added size is marked default, set isDefault=false on every other size
        const existing = isMarkedDefault
          ? prev.variants.map((v) => ({ ...v, isDefault: false }))
          : prev.variants;

        const next = [
          ...existing,
          {
            temperature: temp,
            sizeOz: formatSizeOz(oz),
            price: String(p),
            isDefault: isMarkedDefault,
            ingredients: [],
          },
        ];

        return {
          ...prev,
          variants: next.sort((a, b) => {
            const aTemp = normalizeVariantTemperature(a.temperature);
            const bTemp = normalizeVariantTemperature(b.temperature);
            if (aTemp !== bTemp) return aTemp === "Hot" ? -1 : 1;
            return parseFloat(a.sizeOz) - parseFloat(b.sizeOz);
          }),
        };
      });
    }

    setNewSizeForm({
      temperature: temperatureRule === "ColdOnly" ? "Iced" : "Cold",
      sizeOz: "",
      price: "",
      isDefault: false,
    });
  }

  function handleEditSize(variantKey) {
    const size = formData.variants.find(
      (v) => makeVariantKey(v.temperature, v.sizeOz) === variantKey
    );
    if (!size) return;
    setEditingSizeKey(variantKey);
    setNewSizeForm({
      temperature: size.temperature,
      sizeOz: formatSizeOz(size.sizeOz),
      price: String(size.price),
      isDefault: Boolean(size.isDefault),
    });
    setError("");
  }

  function handleCancelEditSize() {
    setEditingSizeKey(null);
    setNewSizeForm({
      temperature: temperatureRule === "ColdOnly" ? "Iced" : "Cold",
      sizeOz: "",
      price: "",
      isDefault: false,
    });
  }

  function handleRemoveSize(targetKey) {
    if (editingSizeKey === targetKey) {
      handleCancelEditSize();
    }
    if (expandedSizeKey === targetKey) {
      setExpandedSizeKey(null);
    }
    if (activeSizeKeyForPicker === targetKey) {
      setActiveSizeKeyForPicker(null);
    }
    setFormData((prev) => {
      const filtered = prev.variants.filter(
        (v) => makeVariantKey(v.temperature, v.sizeOz) !== targetKey
      );
      let next = filtered;
      if (filtered.length > 0 && !filtered.some((v) => v.isDefault)) {
        next = filtered.map((v, i) => (i === 0 ? { ...v, isDefault: true } : v));
      }
      return { ...prev, variants: next };
    });
  }

  function handleSetDefaultSize(targetKey) {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.map((v) => ({
        ...v,
        isDefault: makeVariantKey(v.temperature, v.sizeOz) === targetKey,
      })),
    }));
  }

  // Live Cost and Margin Calculations
  const calculations = useMemo(() => {
    if (isTakeOutBox) {
      const p = parseFloat(formData.price) || 0;
      return {
        cost: 0,
        price: p,
        profit: p,
        margin: p > 0 ? 100 : 0,
        hasCost: false,
      };
    }

    if (hasSizeOptions && formData.variants.length > 0) {
      // Calculate costs per size (falling back to item recipe if size has no recipe of its own)
      const sizeCosts = formData.variants.map((v) => {
        const ingredientsToUse =
          v.ingredients && v.ingredients.length > 0
            ? v.ingredients
            : formData.ingredients || [];

        const vCost = ingredientsToUse.reduce((sum, ing) => {
          const mat = materialsMap.get(Number(ing.rawMaterialId));
          const unitCost = Number(mat?.costPerUnit) || 0;
          return sum + Number(ing.quantityNeeded) * unitCost;
        }, 0);

        const vPrice = parseFloat(v.price) || 0;
        const vProfit = vPrice - vCost;
        const vMargin = vPrice > 0 ? (vProfit / vPrice) * 100 : 0;
        return {
          ...v,
          cost: vCost,
          profit: vProfit,
          margin: vMargin,
          usedFallback: !v.ingredients || v.ingredients.length === 0,
        };
      });

      return { isSized: true, sizeCosts };
    }

    // Unsized recipe costs
    let costAll = 0;
    let costHot = 0;
    let costCold = 0;

    (formData.ingredients || []).forEach((ing) => {
      const mat = materialsMap.get(Number(ing.rawMaterialId));
      const unitCost = Number(mat?.costPerUnit) || 0;
      const ingCost = Number(ing.quantityNeeded) * unitCost;

      const app = ing.appliesTo;
      if (!app || app === "All") {
        costAll += ingCost;
      } else if (app === "Hot") {
        costHot += ingCost;
      } else if (app === "Cold") {
        costCold += ingCost;
      }
    });

    const totalHotCost = costAll + costHot;
    const totalColdCost = costAll + costCold;

    if (temperatureRule === "Optional") {
      const hPrice = parseFloat(formData.hotPrice) || 0;
      const cPrice = parseFloat(formData.coldPrice) || 0;

      const hotProfit = hPrice - totalHotCost;
      const hotMargin = hPrice > 0 ? (hotProfit / hPrice) * 100 : null;

      const coldProfit = cPrice - totalColdCost;
      const coldMargin = cPrice > 0 ? (coldProfit / cPrice) * 100 : null;

      return {
        isOptional: true,
        hotCost: totalHotCost,
        hotPrice: hPrice,
        hotProfit,
        hotMargin,
        coldCost: totalColdCost,
        coldPrice: cPrice,
        coldProfit,
        coldMargin,
      };
    }

    if (temperatureRule === "ColdOnly") {
      const cPrice = parseFloat(formData.coldPrice) || 0;
      const profit = cPrice - totalColdCost;
      const margin = cPrice > 0 ? (profit / cPrice) * 100 : 0;
      return {
        cost: totalColdCost,
        price: cPrice,
        profit,
        margin,
        hasCost: true,
      };
    }

    // None rule
    const p = parseFloat(formData.price) || 0;
    const profit = p - costAll;
    const margin = p > 0 ? (profit / p) * 100 : 0;
    return {
      cost: costAll,
      price: p,
      profit,
      margin,
      hasCost: true,
    };
  }, [
    isTakeOutBox,
    hasSizeOptions,
    formData.variants,
    formData.ingredients,
    formData.price,
    formData.hotPrice,
    formData.coldPrice,
    materialsMap,
    temperatureRule,
  ]);

  // Validation before Save
  async function handleSubmit(e) {
    if (e) e.preventDefault();
    setError("");

    // 1. Name is required
    if (!formData.name.trim()) {
      setError("Item name is required.");
      return;
    }

    // 2. Category must exist
    if (!selectedCategory) {
      setError("Please select a valid category.");
      return;
    }

    // 3. Subcategory validation: if category has subcategories, subCategoryId is required
    if (subCategories.length > 0) {
      if (!formData.subCategoryId || !selectedSubCategory) {
        setError(`Please select a sub-category under ${selectedCategory.name}.`);
        return;
      }
    }

    // 4. SKU validation
    if (!formData.sku.trim()) {
      setError("SKU is required.");
      return;
    }

    const skuTaken = await checkSkuExists(formData.sku, mode === "edit" ? item?.id : null);
    if (skuTaken) {
      setError(`SKU "${formData.sku}" is already in use by another menu item.`);
      return;
    }

    // 5. Pricing validation driven by rule
    const hasSizes = hasSizeOptions && formData.variants.length > 0;

    if (hasSizes) {
      for (const sz of formData.variants) {
        const oz = parseFloat(sz.sizeOz);
        const pr = parseFloat(sz.price);
        if (isNaN(oz) || oz <= 0) {
          setError("Each size must have a valid oz measurement > 0.");
          return;
        }
        if (isNaN(pr) || pr < 0) {
          setError("Size prices cannot be negative.");
          return;
        }
        if (temperatureRule === "ColdOnly" && sz.temperature === "Hot") {
          setError("Cold-only items cannot have Hot sizes.");
          return;
        }
      }
    } else {
      if (temperatureRule === "None") {
        const p = parseFloat(formData.price);
        if (isNaN(p) || p < 0) {
          setError("Selling price must be greater than or equal to 0.");
          return;
        }
      } else if (temperatureRule === "ColdOnly") {
        const cp = parseFloat(formData.coldPrice);
        if (isNaN(cp) || cp <= 0) {
          setError("Iced price is required and must be greater than 0.");
          return;
        }
      } else if (temperatureRule === "Optional") {
        const hp = formData.hotPrice !== "" ? parseFloat(formData.hotPrice) : null;
        const cp = formData.coldPrice !== "" ? parseFloat(formData.coldPrice) : null;

        const hasValidHp = hp !== null && !isNaN(hp) && hp > 0;
        const hasValidCp = cp !== null && !isNaN(cp) && cp > 0;

        if (!hasValidHp && !hasValidCp) {
          setError("At least one price (Hot or Iced) must be greater than 0.");
          return;
        }
        if (hp !== null && hp <= 0) {
          setError("Hot price must be greater than 0 if entered.");
          return;
        }
        if (cp !== null && cp <= 0) {
          setError("Iced price must be greater than 0 if entered.");
          return;
        }
      }
    }

    // 6. Save-time recipe rules (mirror MenuItemRepository.SaveMenuItemAsync)
    // Skipped for Take Out Boxes
    if (!isTakeOutBox) {
      const activeRecipeRows = (formData.ingredients || []).filter(
        (r) => Number(r.rawMaterialId) > 0 && Number(r.quantityNeeded) > 0
      );

      const effectiveRule = temperatureRule || "None";

      // If the effective temperature rule is "None" (including no sub-category) and any row has appliesTo Hot or Cold
      if (effectiveRule === "None") {
        const hasHotOrCold = activeRecipeRows.some((r) => {
          const applies = r.appliesTo === "Iced" ? "Cold" : r.appliesTo;
          return applies === "Hot" || applies === "Cold";
        });
        if (hasHotOrCold) {
          setError(
            "This item is not a Hot/Cold drink, but its recipe still has Hot-only or Cold-only rows. Set those rows to Hot & Cold or remove them before saving."
          );
          return;
        }
      }

      // If the rule is "ColdOnly" and any row has appliesTo Hot
      if (effectiveRule === "ColdOnly") {
        const hasHot = activeRecipeRows.some((r) => r.appliesTo === "Hot");
        if (hasHot) {
          setError("This drink is Cold only, so its recipe cannot have Hot-only rows.");
          return;
        }
      }

      // If any one material has both an "All" row and a Hot or Cold row
      const byMaterial = new Map();
      activeRecipeRows.forEach((r) => {
        const matId = Number(r.rawMaterialId);
        if (!byMaterial.has(matId)) {
          byMaterial.set(matId, []);
        }
        byMaterial.get(matId).push(r);
      });

      for (const [matId, rows] of byMaterial) {
        const hasAll = rows.some((r) => !r.appliesTo || r.appliesTo === "All");
        const hasHotOrCold = rows.some((r) => {
          const applies = r.appliesTo === "Iced" ? "Cold" : r.appliesTo;
          return applies === "Hot" || applies === "Cold";
        });

        if (hasAll && hasHotOrCold) {
          const mat = materialsMap.get(matId);
          const materialName = mat?.name || "An ingredient";
          setError(
            `${materialName} has both a Hot & Cold row and a Hot-only/Cold-only row, which would deduct it twice. Keep either one Hot & Cold row, or separate Hot and Cold rows.`
          );
          return;
        }
      }
    }

    // 7. Recipe warning check
    let needsRecipeWarning = false;
    let warningMsg = "";

    if (!isTakeOutBox) {
      if (hasSizes) {
        const hasItemRecipe = formData.ingredients && formData.ingredients.length > 0;
        const emptySize = formData.variants.find(
          (v) => (!v.ingredients || v.ingredients.length === 0) && !hasItemRecipe
        );
        if (emptySize) {
          needsRecipeWarning = true;
          warningMsg = `Size "${emptySize.temperature} ${emptySize.sizeOz} oz" has no recipe of its own and no item recipe to fall back to. Save anyway?`;
        }
      } else if (!formData.ingredients || formData.ingredients.length === 0) {
        needsRecipeWarning = true;
        warningMsg = "This item has no recipe ingredients. Save anyway?";
      }
    }

    const payload = {
      ...formData,
      skuPrefix: selectedCategory.skuPrefix,
      temperatureRule,
      hasSizeOptions,
      subCategoryId: subCategories.length > 0 ? selectedSubCategory?.subCategoryId : null,
    };

    if (needsRecipeWarning) {
      setPendingSavePayload(payload);
      setShowRecipeWarning(warningMsg);
      return;
    }

    await executeSave(payload);
  }

  async function executeSave(payload) {
    setSaving(true);
    setError("");
    try {
      if (mode === "add") {
        await createMenuItem(payload);
      } else {
        await updateMenuItem(item.id, payload);
      }
      onSaved(mode === "add" ? `✓ "${payload.name}" created` : `✓ "${payload.name}" updated`);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save menu item.");
    } finally {
      setSaving(false);
      setShowRecipeWarning(false);
      setPendingSavePayload(null);
    }
  }

  if (!open) return null;

  const hasConfiguredSizes = hasSizeOptions && formData.variants.length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto">
      <div className="relative flex h-full sm:h-auto sm:max-h-[92vh] w-full lg:max-w-5xl flex-col rounded-none sm:rounded-2xl border-0 sm:border border-line bg-paper shadow-2xl overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
              {mode === "add" ? "New Menu Item" : `Edit ${formData.name || "Menu Item"}`}
            </h2>
            <p className="text-xs text-ink-soft">
              {mode === "add" ? "Create item & sync with POS counter" : `SKU: ${formData.sku || "—"}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {mode === "edit" && onDeactivate && (
              <button
                type="button"
                onClick={() => onDeactivate(item)}
                className="hidden sm:inline-flex min-h-[44px] items-center rounded-lg border border-alert/30 bg-alert-soft px-3 py-2 text-xs font-semibold text-alert hover:bg-alert/20 transition"
              >
                Deactivate Item
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-ink-soft hover:bg-paper hover:text-ink transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 sm:pb-8">
          {error && (
            <div className="mb-6 rounded-xl bg-alert-soft p-3.5 text-sm font-medium text-alert border border-alert/20">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Core Item Details & Pricing */}
            <div className="lg:col-span-7 space-y-6">
              {/* Basic Info Card */}
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs space-y-4">
                <h3 className="font-semibold text-ink text-base">Basic Details</h3>

                <div>
                  <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-1.5">
                    Item Name <span className="text-alert">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Spanish Latte, Chocolate Croissant"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Optional item notes or preparation instructions…"
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                  />
                </div>

                {/* Category & Subcategory */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-1.5">
                      Category <span className="text-alert">*</span>
                    </label>
                    <select
                      value={formData.categoryId}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.numericId}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {subCategories.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-1.5">
                        Sub-Category <span className="text-alert">*</span>
                      </label>
                      <select
                        value={formData.subCategoryId}
                        onChange={(e) => setFormData((prev) => ({ ...prev, subCategoryId: e.target.value }))}
                        className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                      >
                        <option value="">Choose a sub-category…</option>
                        {subCategories.map((sc) => (
                          <option key={sc.subCategoryId} value={sc.subCategoryId}>
                            {sc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* SKU */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
                      SKU (Read-only)
                    </label>
                    {generatingSku && <span className="text-xs text-accent">Generating…</span>}
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={formData.sku}
                    className="w-full rounded-lg border border-line bg-paper/70 px-3.5 py-2.5 font-mono text-base text-ink outline-none cursor-not-allowed"
                  />
                  <p className="mt-1 text-[11px] text-ink-soft">
                    Auto-generated using category prefix &amp; monotonic sequence.
                  </p>
                </div>

                {/* Photo Upload */}
                <div>
                  <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-1.5">
                    Item Photo
                  </label>
                  <div className="flex flex-wrap items-center gap-4">
                    {formData.imageUrl ? (
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-line bg-white shadow-xs">
                        <img
                          src={formData.imageUrl}
                          alt="Preview"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          title="Remove photo"
                          className="absolute top-1 right-1 rounded-full bg-ink/75 p-1 text-white hover:bg-ink transition"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-line bg-paper text-ink-soft">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                      </div>
                    )}

                    <div className="flex-1 min-w-[200px]">
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        ref={fileInputRef}
                        onChange={handlePhotoUpload}
                        className="hidden"
                        id="menu-photo-upload"
                      />
                      <label
                        htmlFor="menu-photo-upload"
                        className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink shadow-xs transition hover:bg-paper active:scale-95"
                      >
                        {imageProcessing ? "Processing…" : formData.imageUrl ? "Change Photo" : "Upload Photo"}
                      </label>
                      <p className="mt-1 text-[11px] text-ink-soft">
                        JPG/PNG up to 10 MB. Auto-resized to 720px &amp; compressed to &lt;200 KB.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pricing Section (Driven by Temperature Rule and Size Options) */}
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-ink text-base">Pricing</h3>
                  <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs text-ink-soft font-medium">
                    Rule: {temperatureRule}
                  </span>
                </div>

                {hasConfiguredSizes ? (
                  <div className="rounded-xl bg-paper/60 p-4 border border-line/60">
                    <p className="text-xs text-ink-soft">
                      This item has configured cup sizes. Base selling prices are determined by each size option in the Sizes Editor below.
                    </p>
                  </div>
                ) : (
                  <>
                    {temperatureRule === "None" && (
                      <div>
                        <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-1.5">
                          Selling Price (₱) <span className="text-alert">*</span>
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          placeholder="0.00"
                          value={formData.price}
                          onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                          className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                        />
                      </div>
                    )}

                    {temperatureRule === "ColdOnly" && (
                      <div>
                        <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-1.5">
                          Iced Price (₱) <span className="text-alert">*</span>
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          placeholder="0.00"
                          value={formData.coldPrice}
                          onChange={(e) => setFormData((prev) => ({ ...prev, coldPrice: e.target.value }))}
                          className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                        />
                      </div>
                    )}

                    {temperatureRule === "Optional" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-1.5">
                            Hot Price (₱)
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            placeholder="Leave empty if not served Hot"
                            value={formData.hotPrice}
                            onChange={(e) => setFormData((prev) => ({ ...prev, hotPrice: e.target.value }))}
                            className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-1.5">
                            Iced Price (₱)
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            placeholder="Leave empty if not served Iced"
                            value={formData.coldPrice}
                            onChange={(e) => setFormData((prev) => ({ ...prev, coldPrice: e.target.value }))}
                            className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Sizes Editor (Only when subcategory has sizeOptions) */}
              {hasSizeOptions && (
                <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-ink text-base">Sizes &amp; Portions</h3>
                      <p className="text-xs text-ink-soft">
                        Configure size variants and assign individual recipes for each size.
                      </p>
                    </div>
                  </div>

                  {/* Add / Edit Size Form */}
                  <div className="rounded-xl border border-line/70 bg-paper/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                        {editingSizeKey !== null ? "Edit Size Variant" : "Add New Size"}
                      </p>
                      {editingSizeKey !== null && (
                        <button
                          type="button"
                          onClick={handleCancelEditSize}
                          className="text-xs text-ink-soft hover:text-ink underline"
                        >
                          Cancel editing
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-ink-soft mb-1">Temperature</label>
                        <select
                          value={newSizeForm.temperature}
                          onChange={(e) => setNewSizeForm((prev) => ({ ...prev, temperature: e.target.value }))}
                          disabled={temperatureRule === "ColdOnly"}
                          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none"
                        >
                          {temperatureRule !== "ColdOnly" && <option value="Hot">Hot</option>}
                          <option value="Iced">Iced</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-ink-soft mb-1">Size (oz)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder="e.g. 12, 16, 22"
                          value={newSizeForm.sizeOz}
                          onChange={(e) => setNewSizeForm((prev) => ({ ...prev, sizeOz: e.target.value }))}
                          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-ink-soft mb-1">Price (₱)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          placeholder="e.g. 120"
                          value={newSizeForm.price}
                          onChange={(e) => setNewSizeForm((prev) => ({ ...prev, price: e.target.value }))}
                          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-ink-soft">
                        <input
                          type="checkbox"
                          checked={newSizeForm.isDefault}
                          onChange={(e) => setNewSizeForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
                          className="rounded text-accent focus:ring-accent"
                        />
                        Default selection on POS
                      </label>

                      <div className="flex items-center gap-2">
                        {editingSizeKey !== null && (
                          <button
                            type="button"
                            onClick={handleCancelEditSize}
                            className="min-h-[44px] rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-ink hover:bg-paper"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleAddOrUpdateSize}
                          className="min-h-[44px] rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-paper hover:bg-ink/90 transition shadow-xs"
                        >
                          {editingSizeKey !== null ? "Update Size" : "+ Add Size"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Configured Sizes List */}
                  <div className="space-y-3">
                    {formData.variants.map((variant) => {
                      const variantKey = makeVariantKey(variant.temperature, variant.sizeOz);
                      const vIngredients = variant.ingredients || [];
                      const isExpanded = expandedSizeKey === variantKey;
                      const isBeingEdited = editingSizeKey === variantKey;

                      const ingredientsToUse =
                        vIngredients.length > 0 ? vIngredients : formData.ingredients || [];

                      const sizeCost = ingredientsToUse.reduce((sum, ing) => {
                        const mat = materialsMap.get(Number(ing.rawMaterialId));
                        return sum + Number(ing.quantityNeeded) * (Number(mat?.costPerUnit) || 0);
                      }, 0);
                      const sizePrice = parseFloat(variant.price) || 0;
                      const sizeMargin = sizePrice > 0 ? ((sizePrice - sizeCost) / sizePrice) * 100 : 0;

                      return (
                        <div
                          key={variantKey}
                          className={`rounded-xl border p-3.5 transition ${
                            isBeingEdited
                              ? "border-accent bg-accent-soft/20 ring-1 ring-accent"
                              : "border-line bg-paper/30"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  variant.temperature === "Hot"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {variant.temperature}
                              </span>
                              <span className="font-semibold text-ink text-sm">
                                {formatSizeOz(variant.sizeOz)} oz — {formatCurrency(variant.price)}
                              </span>
                              {variant.isDefault && (
                                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                                  Default
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {!variant.isDefault && (
                                <button
                                  type="button"
                                  onClick={() => handleSetDefaultSize(variantKey)}
                                  className="text-xs text-ink-soft hover:text-ink underline"
                                >
                                  Make default
                                </button>
                              )}
                              {/* Edit size button */}
                              <button
                                type="button"
                                onClick={() => handleEditSize(variantKey)}
                                className="min-h-[36px] rounded-lg border border-line bg-surface px-3 py-1 text-xs font-medium text-ink hover:bg-paper"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setExpandedSizeKey(isExpanded ? null : variantKey)}
                                className="min-h-[36px] rounded-lg border border-line bg-surface px-3 py-1 text-xs font-medium text-ink hover:bg-paper"
                              >
                                {isExpanded ? "Hide Recipe" : `Recipe (${vIngredients.length})`}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveSize(variantKey)}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-alert/30 text-alert hover:bg-alert-soft"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          <div className="mt-2 flex gap-4 text-xs text-ink-soft border-t border-line/40 pt-2">
                            <span>Cost: <strong className="text-ink">{formatCurrency(sizeCost)}</strong></span>
                            <span>Margin: <strong className="text-ink">{sizeMargin.toFixed(1)}%</strong></span>
                            {vIngredients.length === 0 && (formData.ingredients || []).length > 0 && (
                              <span className="italic text-ink-soft/80">(using item recipe fallback)</span>
                            )}
                          </div>

                          {/* Expanded Recipe for this specific size */}
                          {isExpanded && (
                            <div className="mt-3 space-y-2 border-t border-line/60 pt-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-ink">
                                  Ingredients for {variant.temperature} {formatSizeOz(variant.sizeOz)} oz
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveSizeKeyForPicker(variantKey);
                                    setPickerOpen(true);
                                  }}
                                  className="min-h-[36px] rounded-lg bg-ink px-3 py-1 text-xs font-semibold text-paper hover:bg-ink/90 transition"
                                >
                                  + Add Ingredient
                                </button>
                              </div>

                              {vIngredients.length === 0 ? (
                                <p className="py-2 text-xs italic text-ink-soft">
                                  No size-specific ingredients added. This size will fall back to the item recipe.
                                </p>
                              ) : (
                                <div className="space-y-1.5">
                                  {vIngredients.map((ing) => {
                                    const mat = materialsMap.get(Number(ing.rawMaterialId));
                                    const unitCost = Number(mat?.costPerUnit) || 0;
                                    const rowCost = Number(ing.quantityNeeded) * unitCost;

                                    return (
                                      <div
                                        key={ing.rawMaterialId}
                                        className="flex items-center justify-between rounded-lg border border-line bg-surface p-2 text-xs"
                                      >
                                        <div>
                                          <span className="font-medium text-ink">{mat?.name || `Material #${ing.rawMaterialId}`}</span>
                                          <span className="text-ink-soft ml-2">
                                            {formatQuantityWithUnit(ing.quantityNeeded, mat?.unit)}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-3">
                                          <span className="tabular-figures text-ink-soft font-medium">
                                            {formatCurrency(rowCost)}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveSizeIngredient(variantKey, ing.rawMaterialId)}
                                            className="text-alert hover:text-alert/80 p-1"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {formData.variants.length === 0 && (
                      <p className="py-4 text-center text-xs text-ink-soft">
                        No sizes added yet. Use the form above to add cup sizes.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Recipe Builder (Shown for all except Take Out Boxes) & Live Cost/Margin Panel */}
            <div className="lg:col-span-5 space-y-6">
              {/* Recipe Builder: Hidden ONLY for Take Out Boxes */}
              {!isTakeOutBox && (
                <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-ink text-base">
                        {hasConfiguredSizes
                          ? "Item recipe (used only by sizes that have no recipe of their own)"
                          : "Recipe Builder"}
                      </h3>
                      <p className="text-xs text-ink-soft">
                        {hasConfiguredSizes
                          ? "Sizes without their own recipe will consume these ingredients."
                          : "Raw materials consumed per serving."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveSizeKeyForPicker(null);
                        setPickerOpen(true);
                      }}
                      className="min-h-[44px] shrink-0 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-paper hover:bg-ink/90 transition shadow-xs"
                    >
                      + Add Ingredient
                    </button>
                  </div>

                  {/* Ingredients List (identified by pair rawMaterialId, appliesTo) */}
                  <div className="space-y-2">
                    {(formData.ingredients || []).map((ing) => {
                      const mat = materialsMap.get(Number(ing.rawMaterialId));
                      const unitCost = Number(mat?.costPerUnit) || 0;
                      const rowCost = Number(ing.quantityNeeded) * unitCost;
                      const appliesKey = ing.appliesTo || "All";

                      return (
                        <div
                          key={`${ing.rawMaterialId}-${appliesKey}`}
                          className="flex items-center justify-between rounded-xl border border-line bg-paper/40 p-3"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-ink text-sm truncate">
                                {mat?.name || `Material #${ing.rawMaterialId}`}
                              </span>
                              {ing.appliesTo && (
                                <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-accent">
                                  {ing.appliesTo === "Cold" ? "Iced" : ing.appliesTo}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-ink-soft">
                              <span>{formatQuantityWithUnit(ing.quantityNeeded, mat?.unit)}</span>
                              <span className="mx-1">•</span>
                              <span>{formatCurrency(unitCost)}/{mat?.unit}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-medium tabular-figures text-ink text-sm">
                              {formatCurrency(rowCost)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(ing.rawMaterialId, ing.appliesTo)}
                              title="Remove ingredient"
                              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-alert/30 text-alert hover:bg-alert-soft"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {(!formData.ingredients || formData.ingredients.length === 0) && (
                      <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-ink-soft">
                        No recipe ingredients added. Click &ldquo;+ Add Ingredient&rdquo; to build this item&rsquo;s recipe.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Take Out Boxes Note */}
              {isTakeOutBox && (
                <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
                  <h3 className="font-semibold text-ink text-base mb-1">Take Out Box</h3>
                  <p className="text-xs text-ink-soft">
                    Packaging item with no ingredient recipe required.
                  </p>
                </div>
              )}

              {/* Live Cost & Margin Panel */}
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs space-y-4">
                <h3 className="font-semibold text-ink text-base">Cost &amp; Profit Margin</h3>

                {calculations.isSized ? (
                  <div className="space-y-3">
                    <p className="text-xs text-ink-soft">Breakdown by cup size:</p>
                    <div className="space-y-2">
                      {calculations.sizeCosts.map((sc) => (
                        <div key={`${sc.temperature}-${sc.sizeOz}`} className="rounded-xl border border-line bg-paper/40 p-3">
                          <div className="flex justify-between text-xs font-semibold text-ink">
                            <span>{sc.temperature} {sc.sizeOz} oz</span>
                            <span>{formatCurrency(sc.price)}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <p className="text-ink-soft text-[11px]">Cost</p>
                              <p className="font-medium text-ink">{formatCurrency(sc.cost)}</p>
                            </div>
                            <div>
                              <p className="text-ink-soft text-[11px]">Profit</p>
                              <p className="font-medium text-ink">{formatCurrency(sc.profit)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-ink-soft text-[11px]">Margin</p>
                              <p className="font-bold text-accent">{sc.margin.toFixed(1)}%</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : calculations.isOptional ? (
                  <div className="space-y-3">
                    {/* Hot Calculation */}
                    <div className="rounded-xl border border-line bg-paper/40 p-3">
                      <div className="flex justify-between text-xs font-semibold text-amber-900">
                        <span>Hot Serving</span>
                        <span>{formatCurrency(calculations.hotPrice)}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-ink-soft text-[11px]">Cost</p>
                          <p className="font-medium text-ink">{formatCurrency(calculations.hotCost)}</p>
                        </div>
                        <div>
                          <p className="text-ink-soft text-[11px]">Profit</p>
                          <p className="font-medium text-ink">{formatCurrency(calculations.hotProfit)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-ink-soft text-[11px]">Margin</p>
                          <p className="font-bold text-accent">
                            {calculations.hotMargin !== null ? `${calculations.hotMargin.toFixed(1)}%` : "—"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Cold Calculation */}
                    <div className="rounded-xl border border-line bg-paper/40 p-3">
                      <div className="flex justify-between text-xs font-semibold text-blue-900">
                        <span>Iced Serving</span>
                        <span>{formatCurrency(calculations.coldPrice)}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-ink-soft text-[11px]">Cost</p>
                          <p className="font-medium text-ink">{formatCurrency(calculations.coldCost)}</p>
                        </div>
                        <div>
                          <p className="text-ink-soft text-[11px]">Profit</p>
                          <p className="font-medium text-ink">{formatCurrency(calculations.coldProfit)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-ink-soft text-[11px]">Margin</p>
                          <p className="font-bold text-accent">
                            {calculations.coldMargin !== null ? `${calculations.coldMargin.toFixed(1)}%` : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-line bg-paper/40 p-3">
                      <p className="text-xs text-ink-soft">Recipe Cost</p>
                      <p className="mt-1 font-display text-lg text-ink font-semibold tabular-figures">
                        {formatCurrency(calculations.cost)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-paper/40 p-3">
                      <p className="text-xs text-ink-soft">Selling Price</p>
                      <p className="mt-1 font-display text-lg text-ink font-semibold tabular-figures">
                        {formatCurrency(calculations.price)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-paper/40 p-3">
                      <p className="text-xs text-ink-soft">Gross Profit</p>
                      <p className="mt-1 font-display text-lg text-ink font-semibold tabular-figures">
                        {formatCurrency(calculations.profit)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-paper/40 p-3">
                      <p className="text-xs text-ink-soft">Gross Margin</p>
                      <p className="mt-1 font-display text-lg text-accent font-bold tabular-figures">
                        {calculations.margin.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Actions Bar */}
        <div className="fixed sm:static bottom-0 inset-x-0 z-30 flex items-center justify-between border-t border-line bg-surface px-5 py-4 shadow-lg sm:shadow-none">
          <div className="sm:hidden">
            {mode === "edit" && onDeactivate && (
              <button
                type="button"
                onClick={() => onDeactivate(item)}
                className="text-xs font-semibold text-alert underline min-h-[44px] flex items-center"
              >
                Deactivate
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 sm:flex-none min-h-[48px] rounded-full border border-line px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-paper"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 sm:flex-none min-h-[48px] rounded-full bg-ink px-8 py-2.5 text-sm font-semibold text-paper transition hover:bg-ink/90 disabled:opacity-50 shadow-sm"
            >
              {saving ? "Saving…" : mode === "add" ? "Create Item" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Material Picker Sub-Modal */}
      <MaterialPickerModal
        open={pickerOpen}
        materials={rawMaterials}
        existingIngredients={
          activeSizeKeyForPicker !== null
            ? (formData.variants.find(
                (v) => makeVariantKey(v.temperature, v.sizeOz) === activeSizeKeyForPicker
              )?.ingredients || [])
            : formData.ingredients || []
        }
        temperatureRule={temperatureRule}
        isSizeRecipe={activeSizeKeyForPicker !== null}
        onSelect={handleAddIngredient}
        onClose={() => {
          setPickerOpen(false);
          setActiveSizeKeyForPicker(null);
        }}
      />

      {/* Recipe Missing Warning Confirmation Dialog */}
      {showRecipeWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h4 className="font-display text-lg font-bold text-ink">Recipe Incomplete</h4>
            <p className="mt-2 text-sm text-ink-soft">{showRecipeWarning}</p>
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowRecipeWarning(false);
                  setPendingSavePayload(null);
                }}
                className="min-h-[44px] rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper"
              >
                Go Back &amp; Edit
              </button>
              <button
                type="button"
                onClick={() => executeSave(pendingSavePayload)}
                className="min-h-[44px] rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink/90"
              >
                Confirm &amp; Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
