import { useMemo, useState, useEffect } from "react";
import { EditMaterialModal } from "./EditMaterialModal";
import { RestockModal } from "./RestockModal";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { Toast } from "./Toast";
import { AiInsightWidget } from "./AiInsightWidget";
import { useAuth } from "../../contexts/AuthContext";
import { MATERIAL_CATEGORIES, formatCurrency } from "../../lib/constants";
import { subscribeToMaterials, deleteMaterial } from "../../lib/firestore/rawMaterials";

export default function InventoryTab() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [toast, setToast] = useState("");

  const [editState, setEditState] = useState({ open: false, mode: "add", material: null });
  const [restockMaterialTarget, setRestockMaterialTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // material to delete
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToMaterials(
      (next) => { setMaterials(next); setLoadError(""); },
      () => setLoadError("Couldn't load inventory. Check your connection and try again.")
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const totalValuation = useMemo(
    () => materials.reduce((sum, m) => sum + (Number(m.stockQty) || 0) * (Number(m.costPerUnit) || 0), 0),
    [materials]
  );

  const lowStockMaterials = useMemo(
    () => materials.filter((m) => Number(m.stockQty) <= Number(m.minStockAlert)),
    [materials]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return materials.filter((m) => {
      const matchesCategory = category === "All" || m.category === category;
      const matchesSearch = !term || m.name?.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [materials, search, category]);

  function handleDone(message) {
    setEditState({ open: false, mode: "add", material: null });
    setRestockMaterialTarget(null);
    setToast(message);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMaterial(deleteTarget.id);
      setToast(`✓ ${deleteTarget.name} deleted`);
      setDeleteTarget(null);
    } catch {
      setToast("❌ Failed to delete. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <section className="mt-6 sm:mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-soft">Total inventory valuation</p>
          <p className="mt-1 font-display text-3xl text-ink tabular-figures">{formatCurrency(totalValuation)}</p>
          <p className="mt-1 text-xs text-ink-soft">Computed live from current stock &amp; cost</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-soft">Low stock</p>
          <p className="mt-1 font-display text-3xl text-ink tabular-figures">{lowStockMaterials.length}</p>
          <p className="mt-1 text-xs text-ink-soft">Materials at or below their alert threshold</p>
        </div>
      </section>

      <AiInsightWidget
        materials={materials}
        totalValuation={totalValuation}
        lowStockMaterials={lowStockMaterials}
      />

      <section className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 sm:w-56"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 sm:w-auto"
          >
            <option value="All">All categories</option>
            {MATERIAL_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <button
          onClick={() => setEditState({ open: true, mode: "add", material: null })}
          className="min-h-[44px] w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink/90 sm:w-auto"
        >
          Add material
        </button>
      </section>

      {loadError && (
        <p className="mt-4 rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert">{loadError}</p>
      )}

      {/* ── Mobile cards ── */}
      <div className="mt-4 space-y-3 md:hidden">
        {filtered.map((material) => {
          const stockQty = Number(material.stockQty) || 0;
          const costPerUnit = Number(material.costPerUnit) || 0;
          const isLow = stockQty <= Number(material.minStockAlert);
          return (
            <div key={`mobile-${material.id}`} className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-medium text-ink">{material.name}</h4>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                    {material.sku && <span className="rounded bg-paper px-2 py-0.5 font-mono font-medium">{material.sku}</span>}
                    <span className="rounded bg-paper px-2 py-0.5">{material.category}</span>
                    <span className="rounded bg-paper px-2 py-0.5">{material.materialType}</span>
                  </div>
                </div>
                {isLow && (
                  <span className="shrink-0 rounded-full bg-alert-soft px-2.5 py-0.5 text-xs font-medium text-alert">
                    Low stock
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-y border-line/60 py-2.5 text-xs">
                <div>
                  <p className="text-ink-soft">Stock</p>
                  <p className="mt-0.5 font-medium tabular-figures text-ink">{stockQty.toLocaleString()} {material.unit}</p>
                </div>
                <div>
                  <p className="text-ink-soft">Cost/unit</p>
                  <p className="mt-0.5 font-medium tabular-figures text-ink">{formatCurrency(costPerUnit)}</p>
                </div>
                <div className="text-right">
                  <p className="text-ink-soft">Value</p>
                  <p className="mt-0.5 font-medium tabular-figures text-ink">{formatCurrency(stockQty * costPerUnit)}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setRestockMaterialTarget(material)}
                  className="flex-1 min-h-[44px] rounded-lg border border-line bg-paper py-2.5 text-center text-xs font-medium text-ink transition hover:bg-line/40"
                >
                  Restock
                </button>
                <button
                  onClick={() => setEditState({ open: true, mode: "edit", material })}
                  className="flex-1 min-h-[44px] rounded-lg border border-line py-2.5 text-center text-xs font-medium text-ink transition hover:bg-paper"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(material)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-alert/30 bg-alert-soft p-2.5 text-alert transition hover:bg-alert/20"
                  title="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && !loadError && (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-ink-soft">
            No materials match. Try a different search, or add your first one.
          </div>
        )}
      </div>

      {/* ── Desktop table ── */}
      <section className="mt-4 hidden overflow-hidden rounded-2xl border border-line bg-surface md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Stock</th>
                <th className="px-4 py-3 text-right font-medium">Cost/unit</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((material) => {
                const stockQty = Number(material.stockQty) || 0;
                const costPerUnit = Number(material.costPerUnit) || 0;
                const isLow = stockQty <= Number(material.minStockAlert);
                return (
                  <tr key={material.id} className="border-b border-line last:border-none">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{material.name}</div>
                      {material.sku && <div className="text-xs text-ink-soft font-mono">{material.sku}</div>}
                      {isLow && (
                        <span className="mt-0.5 inline-block rounded-full bg-alert-soft px-2 py-0.5 text-xs font-medium text-alert">
                          Low stock
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{material.category}</td>
                    <td className="px-4 py-3 text-ink-soft">{material.materialType}</td>
                    <td className="px-4 py-3 text-right tabular-figures text-ink">{stockQty.toLocaleString()} {material.unit}</td>
                    <td className="px-4 py-3 text-right tabular-figures text-ink">{formatCurrency(costPerUnit)}</td>
                    <td className="px-4 py-3 text-right tabular-figures text-ink">{formatCurrency(stockQty * costPerUnit)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setRestockMaterialTarget(material)}
                          className="min-h-[36px] rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper"
                        >
                          Restock
                        </button>
                        <button
                          onClick={() => setEditState({ open: true, mode: "edit", material })}
                          className="min-h-[36px] rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(material)}
                          title="Delete"
                          className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-alert/30 bg-alert-soft p-1.5 text-alert transition hover:bg-alert/20"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4h6v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && !loadError && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-soft">
                    No materials match. Try a different search, or add your first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <EditMaterialModal
        open={editState.open}
        mode={editState.mode}
        material={editState.material}
        userId={user?.uid}
        onClose={() => setEditState({ open: false, mode: "add", material: null })}
        onDone={handleDone}
      />

      <RestockModal
        open={Boolean(restockMaterialTarget)}
        material={restockMaterialTarget}
        userId={user?.uid}
        onClose={() => setRestockMaterialTarget(null)}
        onDone={handleDone}
      />

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        materialName={deleteTarget?.name}
        deleting={deleting}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />

      <Toast message={toast} />
    </>
  );
}
