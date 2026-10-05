export function DeactivateConfirmModal({
  open,
  itemName,
  loading = false,
  onConfirm,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-alert-soft text-alert mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h3 className="font-display text-lg font-semibold text-ink">
          Deactivate Menu Item
        </h3>
        <p className="mt-2 text-sm text-ink-soft">
          Are you sure you want to deactivate <span className="font-medium text-ink">&ldquo;{itemName}&rdquo;</span>?
          It will be hidden from the active menu list and POS counter, but its historical order records will be preserved.
        </p>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="min-h-[44px] rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-paper"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="min-h-[44px] rounded-lg bg-alert px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-alert/90 disabled:opacity-50"
          >
            {loading ? "Deactivating…" : "Deactivate Item"}
          </button>
        </div>
      </div>
    </div>
  );
}
