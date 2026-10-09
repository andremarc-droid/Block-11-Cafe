import { useState, useMemo } from "react";
import { getAllowedUnits, convertToBaseUnit, getPackSize } from "../../lib/services/unitConversion";
import { formatCurrency } from "../../lib/constants";

export function MaterialPickerModal({
  open,
  materials = [],
  existingIngredients = [],
  temperatureRule = "None",
  isSizeRecipe = false,
  onSelect,
  onClose,
}) {
  const [search, setSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [quantityInput, setQuantityInput] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [appliesTo, setAppliesTo] = useState("All");
  const [error, setError] = useState("");

  // Allowed units for the currently selected material
  const allowedUnits = useMemo(() => {
    return getAllowedUnits(selectedMaterial);
  }, [selectedMaterial]);

  // Filter materials: every typed word must appear in name, SKU, or category
  const filteredMaterials = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return materials;

    return materials.filter((m) => {
      const combined = `${m.name || ""} ${m.sku || ""} ${m.category || ""}`.toLowerCase();
      return words.every((word) => combined.includes(word));
    });
  }, [materials, search]);

  if (!open) return null;

  function handleChooseMaterial(mat) {
    const isNumeric = /^\d+$/.test(String(mat.id));
    if (!isNumeric) return; // Disabled

    setSelectedMaterial(mat);
    // Default the selected unit to the material's own unit
    setSelectedUnit(mat.unit || "pcs");
    setError("");

    // Find any existing row(s) for this material
    const sameRows = existingIngredients.filter(
      (ing) => Number(ing.rawMaterialId) === Number(mat.id)
    );

    if (sameRows.length === 1) {
      const row = sameRows[0];
      const rowApplies = row.appliesTo === "Cold" ? "Cold" : row.appliesTo || "All";
      setAppliesTo(rowApplies);
      setQuantityInput(String(row.quantityNeeded || ""));
    } else {
      setQuantityInput("");
      setAppliesTo("All");
    }
  }

  function handleAppliesToChange(newAppliesTo) {
    setAppliesTo(newAppliesTo);
    setError("");

    const matching = existingIngredients.find((ing) => {
      const rowApp = ing.appliesTo === "Cold" ? "Cold" : ing.appliesTo || "All";
      return (
        Number(ing.rawMaterialId) === Number(selectedMaterial?.id) &&
        rowApp === newAppliesTo
      );
    });

    if (matching) {
      setQuantityInput(String(matching.quantityNeeded || ""));
    }
  }

  function handleConfirmAdd() {
    setError("");
    const qty = parseFloat(quantityInput);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a quantity greater than zero.");
      return;
    }

    if (!selectedMaterial) {
      setError("Please select a raw material.");
      return;
    }

    let finalAppliesTo = undefined;
    if (!isSizeRecipe) {
      if (temperatureRule === "Optional") {
        finalAppliesTo = appliesTo === "All" ? undefined : appliesTo;
      } else if (temperatureRule === "ColdOnly") {
        finalAppliesTo = appliesTo === "Cold" ? "Cold" : undefined;
      }
    }

    // Check conflict: A material may not have BOTH an "All" row and a Hot/Cold row
    if (!isSizeRecipe && (temperatureRule === "Optional" || temperatureRule === "ColdOnly")) {
      const targetApplies = finalAppliesTo || "All";
      const sameRows = existingIngredients.filter(
        (ing) => Number(ing.rawMaterialId) === Number(selectedMaterial.id)
      );

      const conflicting = sameRows.find((r) => {
        const rowApplies = r.appliesTo || "All";
        return (rowApplies === "All") !== (targetApplies === "All");
      });

      if (conflicting) {
        const confApp = conflicting.appliesTo || "All";
        let label = "Hot & Cold";
        if (confApp === "Hot") label = "Hot only";
        else if (confApp === "Cold") label = "Cold only";

        setError(
          `${selectedMaterial.name} already has a "${label}" row. Remove that row first if you want to change how this ingredient is split between Hot and Cold.`
        );
        return;
      }
    }

    // Convert entered quantity to the material's base unit
    // (passing the material lets "pcs" convert through its pack size, e.g. 0.5 pcs of a 226 g pack = 113 g)
    const storedQty = convertToBaseUnit(qty, selectedUnit, selectedMaterial.unit, selectedMaterial);

    onSelect({
      rawMaterialId: Number(selectedMaterial.id),
      quantityNeeded: storedQty,
      appliesTo: finalAppliesTo,
    });

    handleClose();
  }

  function handleClose() {
    setSelectedMaterial(null);
    setSearch("");
    setQuantityInput("");
    setError("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="flex h-[90vh] sm:h-auto sm:max-h-[85vh] w-full sm:max-w-2xl flex-col rounded-t-3xl sm:rounded-2xl border border-line bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">
              {selectedMaterial ? `Add ${selectedMaterial.name}` : "Select Material for Recipe"}
            </h3>
            <p className="text-xs text-ink-soft">
              {selectedMaterial
                ? `Base unit: ${selectedMaterial.unit} (${formatCurrency(selectedMaterial.costPerUnit || 0)} / ${selectedMaterial.unit})`
                : "Search from raw materials"}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-ink-soft hover:bg-paper hover:text-ink transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!selectedMaterial ? (
            <div>
              {/* Search input */}
              <div className="sticky top-0 z-10 bg-surface pb-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search material by name, SKU, or category…"
                  autoFocus
                  className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
              </div>

              {/* Material List */}
              <div className="mt-2 space-y-2">
                {filteredMaterials.map((mat) => {
                  const isNumeric = /^\d+$/.test(String(mat.id));
                  const isAlreadyInRecipe = existingIngredients.some(
                    (ing) => Number(ing.rawMaterialId) === Number(mat.id)
                  );

                  return (
                    <button
                      key={mat.id}
                      disabled={!isNumeric}
                      onClick={() => handleChooseMaterial(mat)}
                      className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                        isNumeric
                          ? "border-line bg-surface hover:border-accent hover:bg-accent-soft/30 cursor-pointer"
                          : "border-line/60 bg-paper/60 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink truncate">{mat.name}</span>
                          {mat.sku && (
                            <span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
                              {mat.sku}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                          <span>{mat.category}</span>
                          <span>•</span>
                          <span>{mat.materialType}</span>
                          <span>•</span>
                          <span>{formatCurrency(mat.costPerUnit || 0)} / {mat.unit}</span>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {!isNumeric ? (
                          <span className="rounded-full bg-alert-soft px-2.5 py-1 text-[11px] font-medium text-alert">
                            waiting for POS sync
                          </span>
                        ) : isAlreadyInRecipe ? (
                          <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-medium text-ink-soft">
                            In recipe
                          </span>
                        ) : (
                          <span className="rounded-lg bg-paper px-3 py-1.5 text-xs font-semibold text-ink group-hover:bg-ink group-hover:text-paper">
                            Select
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {filteredMaterials.length === 0 && (
                  <p className="py-8 text-center text-sm text-ink-soft">
                    No materials found matching &ldquo;{search}&rdquo;.
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* Selected Material: Enter Quantity, Unit, and Applies To */
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-paper/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-ink">{selectedMaterial.name}</h4>
                    <p className="text-xs text-ink-soft">
                      {selectedMaterial.category} • Cost: {formatCurrency(selectedMaterial.costPerUnit || 0)} per {selectedMaterial.unit}
                    </p>
                    {getPackSize(selectedMaterial) > 0 && (
                      <p className="text-xs text-ink-soft">
                        1 pcs = {getPackSize(selectedMaterial)} {selectedMaterial.unit}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedMaterial(null)}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    Change material
                  </button>
                </div>
              </div>

              {/* Quantity and Unit inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink-soft mb-1">
                    Quantity Needed
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    placeholder="e.g. 15 or 0.25"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                    autoFocus
                    className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-soft mb-1">
                    Unit
                  </label>
                  <select
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                  >
                    {allowedUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Temperature Applicability */}
              {!isSizeRecipe && (temperatureRule === "Optional" || temperatureRule === "ColdOnly") && (
                <div>
                  <label className="block text-xs font-medium text-ink-soft mb-1.5">
                    Applies To
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleAppliesToChange("All")}
                      className={`flex-1 min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        appliesTo === "All"
                          ? "border-ink bg-ink text-paper"
                          : "border-line bg-surface text-ink hover:bg-paper"
                      }`}
                    >
                      All (Hot &amp; Iced)
                    </button>
                    {temperatureRule === "Optional" && (
                      <button
                        type="button"
                        onClick={() => handleAppliesToChange("Hot")}
                        className={`flex-1 min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium transition ${
                          appliesTo === "Hot"
                            ? "border-ink bg-ink text-paper"
                            : "border-line bg-surface text-ink hover:bg-paper"
                        }`}
                      >
                        Hot Only
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAppliesToChange("Cold")}
                      className={`flex-1 min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        appliesTo === "Cold"
                          ? "border-ink bg-ink text-paper"
                          : "border-line bg-surface text-ink hover:bg-paper"
                      }`}
                    >
                      Iced Only
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-lg bg-alert-soft px-3 py-2 text-xs font-medium text-alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedMaterial && (
          <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4 bg-surface">
            <button
              onClick={() => setSelectedMaterial(null)}
              className="min-h-[44px] rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper transition"
            >
              Back
            </button>
            <button
              onClick={handleConfirmAdd}
              className="min-h-[44px] rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-paper hover:bg-ink/90 transition shadow-xs"
            >
              Add to Recipe
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
