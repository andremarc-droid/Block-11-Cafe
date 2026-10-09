import { useEffect, useState } from "react";
import { MATERIAL_CATEGORIES, MATERIAL_TYPES, UNITS_BY_TYPE } from "../../lib/constants";
import { createMaterial, saveMaterialEdit } from "../../lib/firestore/rawMaterials";

// Units a piece's contents can be described in ("1 pc = 226 g"). Label only; stock itself is counted in pcs.
const PACK_UNITS = ["g", "kg", "ml", "liter"];

const EMPTY_FORM = {
  name: "",
  category: MATERIAL_CATEGORIES[0],
  materialType: "General",
  unit: "g",
  stockQty: "",
  costPerUnit: "",
  minStockAlert: "",
  packSize: "",
  packUnit: "g",
};

export function EditMaterialModal({ open, mode, material, userId, onClose, onDone }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && material) {
      setForm({
        name: material.name ?? "",
        category: material.category ?? MATERIAL_CATEGORIES[0],
        materialType: material.materialType ?? "General",
        unit: material.unit ?? "g",
        stockQty: String(material.stockQty ?? 0),
        costPerUnit: String(material.costPerUnit ?? 0),
        minStockAlert: String(material.minStockAlert ?? 0),
        packSize: material.packSize ? String(material.packSize) : "",
        // Older materials had a pack size in their own unit (g/kg/ml/liter) and no packUnit; pcs materials default to g.
        packUnit: material.packUnit ?? (material.packSize && material.unit && material.unit !== "pcs" ? material.unit : "g"),
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError("");
  }, [open, mode, material]);

  if (!open) return null;

  const availableUnits = UNITS_BY_TYPE[form.materialType] ?? UNITS_BY_TYPE.General;

  // Pack size (what one piece holds, e.g. 1 pc = 226 g) is optional and only shown when the unit is pcs.
  // Packaging (cups, boxes) is counted in plain pieces, so it never gets one.
  const showPackSize = form.unit === "pcs" && form.materialType !== "Packaging";

  function updateField(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "materialType" && !UNITS_BY_TYPE[value]?.includes(prev.unit)) {
        next.unit = UNITS_BY_TYPE[value]?.[0] ?? "g";
      }
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const name = form.name.trim();
    const stockQty = Number(form.stockQty.replace(/,/g, ""));
    const costPerUnit = Number(form.costPerUnit.replace(/,/g, ""));
    const minStockAlert = Number(form.minStockAlert.replace(/,/g, ""));

    if (!name) { setError("Enter a material name."); return; }
    if (!Number.isFinite(stockQty) || stockQty < 0) { setError("Stock quantity must be 0 or more."); return; }
    if (!Number.isFinite(costPerUnit) || costPerUnit < 0) { setError("Cost per unit must be 0 or more."); return; }
    if (!Number.isFinite(minStockAlert) || minStockAlert < 0) { setError("Min stock alert must be 0 or more."); return; }

    // Optional: how much one piece holds (e.g. 226 g). Only for materials counted in pcs. Blank = none.
    let packSize = null;
    let packUnit = null;
    if (showPackSize) {
      if (form.packSize.trim() !== "") {
        packSize = Number(form.packSize.replace(/,/g, ""));
        if (!Number.isFinite(packSize) || packSize <= 0) {
          setError(`Pack size must be greater than 0 (how many ${form.packUnit} one piece holds), or leave it blank.`);
          return;
        }
        packUnit = form.packUnit;
      }
    } else if (
      mode === "edit" && material && material.unit !== "pcs" && material.unit === form.unit &&
      Number(material.packSize) > 0 && !material.packUnit
    ) {
      // Older material counted in g/kg/ml/liter with a pack size: keep it untouched so Restock's "pcs" option keeps working.
      packSize = Number(material.packSize);
    }

    // Everything is saved in the material's base unit (the POS depends on it).
    const round4 = (v) => Math.round(v * 10000) / 10000;
    const fields = {
      name,
      category: form.category,
      materialType: form.materialType,
      unit: form.unit,
      stockQty: round4(stockQty),
      costPerUnit: round4(costPerUnit),
      minStockAlert: round4(minStockAlert),
      packSize,
      packUnit,
    };

    setSaving(true);
    try {
      if (mode === "edit") {
        await saveMaterialEdit(material.id, fields);
        onDone(`✓ ${name} Edited`);
      } else {
        await createMaterial(fields, userId);
        onDone("✓ Raw Material added");
      }
    } catch {
      setError("Something went wrong saving this material. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    /*
      Overlay: fixed inset-0 so it covers the whole screen.
      Inner wrapper: overflow-y-auto so the modal content scrolls
      when the keyboard pushes the viewport up on mobile.
      The modal card itself has no fixed height — it grows with content
      and the scroll container handles overflow.
    */
    <div className="fixed inset-0 z-40 bg-ink/40" onClick={onClose}>
      <div
        className="flex min-h-full items-start justify-center overflow-y-auto px-4 py-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
          <h2 className="font-display text-xl text-ink">
            {mode === "edit" ? "Edit raw material" : "New raw material"}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {mode === "edit"
              ? "Direct corrections only — for adding stock, use Restock instead."
              : "Starting stock and cost become the baseline going forward."}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft" htmlFor="name">Name</label>
              <input
                id="name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-soft" htmlFor="category">Category</label>
                <select
                  id="category"
                  value={form.category}
                  onChange={(e) => updateField("category", e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                >
                  {MATERIAL_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-soft" htmlFor="materialType">Material type</label>
                <select
                  id="materialType"
                  value={form.materialType}
                  onChange={(e) => updateField("materialType", e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                >
                  {MATERIAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-soft" htmlFor="unit">Unit</label>
                <select
                  id="unit"
                  value={form.unit}
                  onChange={(e) => updateField("unit", e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                >
                  {availableUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-soft" htmlFor="stockQty">Stock qty</label>
                <input
                  id="stockQty"
                  inputMode="decimal"
                  placeholder="e.g. 1,000"
                  value={form.stockQty}
                  onChange={(e) => updateField("stockQty", e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none placeholder:text-ink-soft/50 focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-soft" htmlFor="costPerUnit">Cost/unit</label>
                <input
                  id="costPerUnit"
                  inputMode="decimal"
                  placeholder="e.g. 85.00"
                  value={form.costPerUnit}
                  onChange={(e) => updateField("costPerUnit", e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none placeholder:text-ink-soft/50 focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
              </div>
            </div>

            {showPackSize && (
              <div>
                <label className="block text-sm font-medium text-ink-soft" htmlFor="packSize">
                  Pack size <span className="font-normal">(optional)</span>
                </label>
                <div className="mt-1.5 flex items-center gap-2 text-base text-ink">
                  <span>1 pc =</span>
                  <input
                    id="packSize"
                    inputMode="decimal"
                    placeholder="e.g. 226"
                    value={form.packSize}
                    onChange={(e) => updateField("packSize", e.target.value)}
                    className="w-28 rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none placeholder:text-ink-soft/50 focus:border-accent focus:ring-2 focus:ring-accent/25"
                  />
                  <select
                    id="packUnit"
                    aria-label="Pack size unit"
                    value={form.packUnit}
                    onChange={(e) => updateField("packUnit", e.target.value)}
                    className="rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                  >
                    {PACK_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>

                <p className="mt-2 text-xs text-ink-soft">
                  How much one piece holds, like a container of 226 g. Stock, cost and alert above are counted in pcs.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink-soft" htmlFor="minStockAlert">Min stock alert threshold</label>
              <input
                id="minStockAlert"
                inputMode="decimal"
                placeholder="e.g. 10"
                value={form.minStockAlert}
                onChange={(e) => updateField("minStockAlert", e.target.value)}
                className="mt-1.5 w-full max-w-[10rem] rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none placeholder:text-ink-soft/50 focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </div>

            {error && <p className="rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-medium text-ink-soft transition hover:bg-paper">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="rounded-lg bg-ink px-4 py-2 font-medium text-paper transition hover:bg-ink/90 disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
