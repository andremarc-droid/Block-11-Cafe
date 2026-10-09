import { useEffect, useState } from "react";
import { formatCurrency } from "../../lib/constants";
import { restockMaterial } from "../../lib/firestore/rawMaterials";
import { convertToBaseUnit, formatPcsEquivalent, getPackSize } from "../../lib/services/unitConversion";

export function RestockModal({ open, material, userId, onClose, onDone }) {
  const [qtyInput, setQtyInput] = useState("");
  const [costInput, setCostInput] = useState("");
  // Unit the quantity is typed in: the material's base unit, or "pcs" when it has a pack size.
  const [entryUnit, setEntryUnit] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && material) {
      setQtyInput("");
      setCostInput(String(material.costPerUnit ?? 0));
      setEntryUnit(material.unit ?? "");
      setError("");
    }
  }, [open, material]);

  if (!open || !material) return null;

  const existingQty = Number(material.stockQty) || 0;
  const existingCost = Number(material.costPerUnit) || 0;

  const baseUnit = material.unit;
  const packSize = getPackSize(material);
  const canUsePcs = packSize > 0 && (baseUnit || "").trim().toLowerCase() !== "pcs";
  const isPcs = canUsePcs && entryUnit === "pcs";
  const unitInUse = isPcs ? "pcs" : baseUnit;

  // Quantity as typed (in unitInUse) and converted to the base unit the stock is tracked in.
  const qty = Number(qtyInput);
  const qtyValid = qtyInput.trim() !== "" && Number.isFinite(qty) && qty > 0;
  const baseQty = qtyValid ? convertToBaseUnit(qty, unitInUse, baseUnit, material) : 0;

  // The cost box is per unitInUse (per pcs = per base unit x pack size). Everything stored/blended is per base unit.
  const costFactor = isPcs ? packSize : 1;
  const costIsBlank = costInput.trim() === "";
  const parsedCost = Number(costInput);
  const costValid = costIsBlank || (Number.isFinite(parsedCost) && parsedCost >= 0);
  const effectiveCost = costIsBlank ? existingCost : parsedCost / costFactor;

  function handleEntryUnitChange(event) {
    const next = event.target.value;
    setEntryUnit(next);
    // Keep the cost box meaningful for the new unit: per pcs = per base unit x pack size.
    const factor = next === "pcs" ? packSize : 1;
    setCostInput(String(Math.round(existingCost * factor * 10000) / 10000));
  }

  let preview = null;
  if (qtyValid && costValid) {
    const newQty = existingQty + baseQty;
    const newCost = existingQty <= 0 ? effectiveCost : (existingQty * existingCost + baseQty * effectiveCost) / newQty;
    preview = { newQty, newCost };
  }

  async function handleConfirm(event) {
    event.preventDefault();
    setError("");
    if (!qtyValid) { setError("Enter a quantity greater than 0."); return; }
    if (!costValid) { setError("Enter a valid cost per unit."); return; }

    setSaving(true);
    try {
      await restockMaterial({ materialId: material.id, addQty: baseQty, restockCost: effectiveCost, userId });
      onDone(`✓ ${material.name} Restocked`);
    } catch {
      setError("Something went wrong applying this restock. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-ink/40" onClick={onClose}>
      <div
        className="flex min-h-full items-start justify-center overflow-y-auto px-4 py-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
          <h2 className="font-display text-xl text-ink">Restock {material.name}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Current: {existingQty.toLocaleString()} {material.unit} @ {formatCurrency(existingCost)}/unit
          </p>

          <form onSubmit={handleConfirm} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft" htmlFor="restockQty">
                Quantity to add
              </label>
              <input
                id="restockQty"
                inputMode="decimal"
                autoFocus
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                placeholder={`0 ${unitInUse}`}
                className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </div>

            {canUsePcs && (
              <div>
                <label className="block text-sm font-medium text-ink-soft" htmlFor="restockUnit">
                  Count in
                </label>
                <select
                  id="restockUnit"
                  value={unitInUse}
                  onChange={handleEntryUnitChange}
                  className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                >
                  <option value={baseUnit}>{baseUnit}</option>
                  <option value="pcs">pcs (1 pcs = {packSize} {baseUnit})</option>
                </select>
                {isPcs && qtyValid && (
                  <p className="mt-1 text-xs text-ink-soft">
                    Adds {baseQty.toLocaleString()} {baseUnit} to stock.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink-soft" htmlFor="restockCost">
                Cost per {unitInUse} (this restock)
              </label>
              <input
                id="restockCost"
                inputMode="decimal"
                value={costInput}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setCostInput(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
              <p className="mt-1 text-xs text-ink-soft">
                Leave as-is for no price change — only edit if the new stock cost differently.
              </p>
            </div>

            <div className="rounded-lg bg-accent-soft px-3 py-2.5 text-sm text-ink">
              {preview ? (
                <>
                  New stock: <strong className="tabular-figures">{preview.newQty.toLocaleString()} {material.unit}</strong>
                  {canUsePcs && <> ({formatPcsEquivalent(material, preview.newQty)})</>}
                  {" · "}
                  New WAC cost: <strong className="tabular-figures">{formatCurrency(preview.newCost)}/unit</strong>
                </>
              ) : (
                <span className="text-ink-soft">Enter a quantity to see the new stock and cost.</span>
              )}
            </div>

            {error && <p className="rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-medium text-ink-soft transition hover:bg-paper">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 font-medium text-paper transition hover:bg-accent/90 disabled:opacity-60">
                {saving ? "Restocking…" : "Confirm restock"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
