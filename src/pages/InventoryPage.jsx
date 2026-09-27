import { useMemo, useState, useEffect } from "react";
import { EditMaterialModal } from "../components/inventory/EditMaterialModal";
import { RestockModal } from "../components/inventory/RestockModal";
import { Toast } from "../components/inventory/Toast";
import { AiInsightWidget } from "../components/inventory/AiInsightWidget";
import { useAuth } from "../contexts/AuthContext";
import { MATERIAL_CATEGORIES, formatCurrency } from "../lib/constants";
import { subscribeToMaterials } from "../lib/firestore/rawMaterials";
import logo from "../assets/B11 WHITE.png";

export default function InventoryPage() {
  const { user, logout } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [toast, setToast] = useState("");

  const [editState, setEditState] = useState({ open: false, mode: "add", material: null });
  const [restockMaterialTarget, setRestockMaterialTarget] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToMaterials(
      (next) => {
        setMaterials(next);
        setLoadError("");
      },
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

  const lowStockCount = lowStockMaterials.length;

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

  return (
    <div className="min-h-screen bg-paper pb-16">
      {/* ── Header — brown background so the white logo is visible ── */}
      <header style={{ backgroundColor: "#2b211b" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <img
            src={logo}
            alt="Block 11 Cafe"
            className="h-24 w-auto object-contain"
          />
          <div className="flex items-center gap-4">
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
              {user?.email}
            </span>
            <button
              onClick={logout}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium transition"
              style={{
                borderColor: "rgba(255,255,255,0.25)",
                color: "rgba(255,255,255,0.85)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm text-ink-soft">Total inventory valuation</p>
            <p className="mt-1 font-display text-3xl text-ink tabular-figures">
              {formatCurrency(totalValuation)}
            </p>
            <p className="mt-1 text-xs text-ink-soft">Computed live from current stock &amp; cost</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm text-ink-soft">Low stock</p>
            <p className="mt-1 font-display text-3xl text-ink tabular-figures">{lowStockCount}</p>
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
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search materials…"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 sm:w-56"
            />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 sm:w-auto"
            >
              <option value="All">All categories</option>
              {MATERIAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setEditState({ open: true, mode: "add", material: null })}
            className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink/90 sm:w-auto"
          >
            Add material
          </button>
        </section>

        {loadError && (
          <p className="mt-4 rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert">{loadError}</p>
        )}

        {/* Mobile cards */}
        <div className="mt-4 space-y-3 md:hidden">
          {filtered.map((material) => {
            const stockQty = Number(material.stockQty) || 0;
            const costPerUnit = Number(material.costPerUnit) || 0;
            const isLow = stockQty <= Number(material.minStockAlert);
            return (
              <div
                key={`mobile-${material.id}`}
                className="rounded-2xl border border-line bg-surface p-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-medium text-ink">{material.name}</h4>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
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
                    <p className="mt-0.5 font-medium tabular-figures text-ink">
                      {stockQty.toLocaleString()} {material.unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-soft">Cost/unit</p>
                    <p className="mt-0.5 font-medium tabular-figures text-ink">
                      {formatCurrency(costPerUnit)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-ink-soft">Value</p>
                    <p className="mt-0.5 font-medium tabular-figures text-ink">
                      {formatCurrency(stockQty * costPerUnit)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setRestockMaterialTarget(material)}
                    className="flex-1 rounded-lg border border-line bg-paper py-2 text-center text-xs font-medium text-ink transition hover:bg-line/40 active:scale-[0.98]"
                  >
                    Restock
                  </button>
                  <button
                    onClick={() => setEditState({ open: true, mode: "edit", material })}
                    className="flex-1 rounded-lg border border-line py-2 text-center text-xs font-medium text-ink transition hover:bg-paper active:scale-[0.98]"
                  >
                    Edit
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

        {/* Desktop table */}
        <section className="mt-4 hidden overflow-hidden rounded-2xl border border-line bg-surface md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
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
                        {isLow && (
                          <span className="mt-0.5 inline-block rounded-full bg-alert-soft px-2 py-0.5 text-xs font-medium text-alert">
                            Low stock
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{material.category}</td>
                      <td className="px-4 py-3 text-ink-soft">{material.materialType}</td>
                      <td className="px-4 py-3 text-right tabular-figures text-ink">
                        {stockQty.toLocaleString()} {material.unit}
                      </td>
                      <td className="px-4 py-3 text-right tabular-figures text-ink">
                        {formatCurrency(costPerUnit)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-figures text-ink">
                        {formatCurrency(stockQty * costPerUnit)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setRestockMaterialTarget(material)}
                            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper"
                          >
                            Restock
                          </button>
                          <button
                            onClick={() => setEditState({ open: true, mode: "edit", material })}
                            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper"
                          >
                            Edit
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
      </main>

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

      <Toast message={toast} />
    </div>
  );
}
