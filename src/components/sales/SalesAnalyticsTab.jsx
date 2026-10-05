import { useState, useEffect, useCallback } from "react";
import { formatPeso } from "../../lib/constants";
import {
  PERIODS,
  getSalesSummary,
  downloadSalesCsv,
} from "../../lib/firestore/salesReport";

export default function SalesAnalyticsTab() {
  const [selectedPeriod, setSelectedPeriod] = useState("daily");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summaryData, setSummaryData] = useState(null);
  const [safetyLimitNotice, setSafetyLimitNotice] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadReport = useCallback(async (periodId, forceRefresh = false) => {
    setLoading(true);
    setError("");
    try {
      const { summary, hitSafetyLimit } = await getSalesSummary(
        periodId,
        forceRefresh
      );
      setSummaryData(summary);
      setSafetyLimitNotice(hitSafetyLimit);
    } catch (err) {
      console.error("Failed to load sales report:", err);
      setError("Couldn't load sales analytics. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(selectedPeriod, false);
  }, [selectedPeriod, loadReport]);

  function handlePeriodChange(periodId) {
    if (periodId === selectedPeriod) return;
    setSelectedPeriod(periodId);
  }

  function handleRefresh() {
    loadReport(selectedPeriod, true);
  }

  function handleExportCsv() {
    if (!summaryData) return;
    setExporting(true);
    try {
      downloadSalesCsv(summaryData);
    } catch (err) {
      console.error("Failed to export CSV:", err);
    } finally {
      setTimeout(() => setExporting(false), 500);
    }
  }

  function handlePrint() {
    window.print();
  }

  const periodLabel =
    PERIODS.find((p) => p.id === selectedPeriod)?.title || "Sales Summary";

  return (
    <section className="mt-6 sm:mt-8 pb-12">
      {/* Print-only Report Header */}
      <div className="hidden print:block mb-6 border-b border-line pb-4">
        <h1 className="text-2xl font-bold font-display text-ink">
          Block XI Café — Sales Analytics &amp; Performance Report
        </h1>
        <p className="text-sm text-ink-soft mt-1">
          Period: <span className="font-semibold">{periodLabel}</span> &bull;
          Generated on {new Date().toLocaleString("en-PH")}
        </p>
      </div>

      {/* Top Bar: Title & Action Buttons (Hidden in print) */}
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Sales Analytics &amp; Reports
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Live revenue performance, peak rush velocity, and product sales insights.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="btn-sales-refresh"
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            title="Reload data from Firestore"
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-xs transition hover:bg-paper/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={loading ? "animate-spin text-accent" : "text-ink-soft"}
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>

          <button
            id="btn-sales-export-csv"
            type="button"
            onClick={handleExportCsv}
            disabled={loading || !summaryData}
            title="Download CSV report"
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-xs transition hover:bg-paper/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{exporting ? "Exporting..." : "Export CSV"}</span>
          </button>

          <button
            id="btn-sales-print"
            type="button"
            onClick={handlePrint}
            disabled={loading || !summaryData}
            title="Print or save as PDF"
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-paper shadow-xs transition hover:bg-ink/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      {/* Period Selector Segmented Big Pills (Hidden in print) */}
      <div className="no-print mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/70 p-1.5 shadow-2xs sm:gap-3">
        {PERIODS.map((period) => {
          const isActive = selectedPeriod === period.id;
          return (
            <button
              key={period.id}
              id={`btn-period-${period.id}`}
              type="button"
              onClick={() => handlePeriodChange(period.id)}
              className={`flex-1 min-h-[44px] cursor-pointer rounded-xl px-4 py-2 text-center text-sm font-semibold whitespace-nowrap transition-all duration-150 sm:text-base ${
                isActive
                  ? "border border-ink bg-ink text-paper shadow-xs"
                  : "border border-transparent bg-transparent text-ink-soft hover:bg-paper/60 hover:text-ink"
              }`}
            >
              {period.label}
            </button>
          );
        })}
      </div>

      {/* Safety Limit Alert Banner */}
      {safetyLimitNotice && !loading && (
        <div
          role="alert"
          className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0 text-amber-600"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="font-semibold text-sm">
                Safety limit reached (5,000 orders)
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                Data was capped at the 5,000 most recent orders for this period
                to ensure system responsiveness. Older orders are not included.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error State with Retry Button */}
      {error && !loading && (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-alert/30 bg-alert-soft p-6 text-center shadow-xs"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-alert/15 text-alert">
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
          <h3 className="mt-3 font-display text-lg font-semibold text-ink">
            Couldn&apos;t load sales analytics
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            Please check your internet connection and try again.
          </p>
          <button
            id="btn-sales-retry"
            type="button"
            onClick={handleRefresh}
            className="mt-4 inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-paper shadow-xs transition hover:bg-ink/90 active:scale-95"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton View */}
      {loading && (
        <div className="mt-6 space-y-6 animate-pulse">
          {/* KPI Skeletons */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl border border-line/60 bg-surface/80 p-4"
              >
                <div className="h-3 w-16 rounded bg-line/60" />
                <div className="mt-3 h-7 w-24 rounded bg-line/80" />
                <div className="mt-2 h-2.5 w-20 rounded bg-line/40" />
              </div>
            ))}
          </div>

          {/* Chart Skeleton */}
          <div className="h-64 rounded-2xl border border-line/60 bg-surface/80 p-6">
            <div className="h-4 w-40 rounded bg-line/60" />
            <div className="mt-8 flex h-40 items-end justify-between gap-3">
              {[...Array(7)].map((_, i) => (
                <div
                  key={i}
                  className="w-full rounded-t-lg bg-line/40"
                  style={{ height: `${20 + (i % 4) * 20}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Dashboard */}
      {!loading && !error && summaryData && (
        <div className="mt-6 space-y-6">
          {/* Zero Orders Banner (Clear zero-state notice) */}
          {summaryData.totalOrders === 0 && (
            <div className="rounded-2xl border border-line bg-surface/90 p-4 text-center">
              <span className="inline-block rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink-soft">
                Zero Orders
              </span>
              <p className="mt-1 text-sm font-medium text-ink">
                No orders recorded for this period. Showing zeros as expected.
              </p>
            </div>
          )}

          {/* 1. KPI Cards Grid (6 Financial & Operational Metrics) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:gap-4">
            {/* Gross Revenue */}
            <div className="print-avoid-break flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-xs transition hover:border-line/90">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Gross Revenue
                </p>
                <p className="mt-2 font-display text-xl sm:text-2xl font-bold text-ink tabular-figures truncate">
                  {formatPeso(summaryData.grossRevenue)}
                </p>
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                All billed orders
              </p>
            </div>

            {/* Net Revenue */}
            <div className="print-avoid-break flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-xs transition hover:border-line/90">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Net Revenue
                </p>
                <p className="mt-2 font-display text-xl sm:text-2xl font-bold text-ink tabular-figures truncate">
                  {formatPeso(summaryData.netRevenue)}
                </p>
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                Gross minus refunds
              </p>
            </div>

            {/* Total Refunds */}
            <div className="print-avoid-break flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-xs transition hover:border-line/90">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Total Refunds
                </p>
                <p className="mt-2 font-display text-xl sm:text-2xl font-bold text-alert tabular-figures truncate">
                  {summaryData.totalRefunds > 0 ? "-" : ""}
                  {formatPeso(summaryData.totalRefunds)}
                </p>
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                {summaryData.refundCount} refunded order
                {summaryData.refundCount === 1 ? "" : "s"}
              </p>
            </div>

            {/* Total Orders */}
            <div className="print-avoid-break flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-xs transition hover:border-line/90">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Total Orders
                </p>
                <p className="mt-2 font-display text-xl sm:text-2xl font-bold text-ink tabular-figures">
                  {summaryData.totalOrders.toLocaleString()}
                </p>
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                Transactions count
              </p>
            </div>

            {/* Average Order Value (AOV) */}
            <div className="print-avoid-break flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-xs transition hover:border-line/90">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Average Order
                </p>
                <p className="mt-2 font-display text-xl sm:text-2xl font-bold text-ink tabular-figures truncate">
                  {formatPeso(summaryData.averageOrderValue)}
                </p>
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                Gross per order
              </p>
            </div>

            {/* Refund Rate */}
            <div className="print-avoid-break flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-xs transition hover:border-line/90">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Refund Rate
                </p>
                <p className="mt-2 font-display text-xl sm:text-2xl font-bold text-ink tabular-figures">
                  {summaryData.refundRate.toFixed(1)}%
                </p>
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                Refunds / total orders
              </p>
            </div>
          </div>

          {/* 2. Hourly Sales Velocity Bar Chart (Pure Divs/SVG, 7 chromatic buckets) */}
          <div className="print-avoid-break rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-4 border-b border-line/60">
              <div>
                <h3 className="font-display text-lg font-bold text-ink">
                  Hourly Sales Velocity
                </h3>
                <p className="text-xs sm:text-sm text-ink-soft">
                  Revenue grouped into 7 peak operating windows (local store time)
                </p>
              </div>
              <div className="text-xs font-medium text-ink-soft">
                {summaryData.totalOrders > 0
                  ? "Based on order createdAt timestamp"
                  : "No sales recorded"}
              </div>
            </div>

            {/* The 7 chromatic bars container */}
            <div className="mt-6 flex h-48 sm:h-56 items-end gap-2 sm:gap-4 pt-6 px-1 sm:px-4">
              {summaryData.hourlyVelocity.map((bucket) => {
                const heightPct = Math.round(bucket.barHeightPercentage * 100);
                return (
                  <div
                    key={bucket.timeLabel}
                    className="group relative flex h-full flex-1 flex-col items-center justify-end"
                  >
                    {/* Amount Label above bar */}
                    <div className="mb-2 text-center">
                      <span className="block text-[10px] sm:text-xs font-semibold text-ink tabular-figures whitespace-nowrap">
                        {bucket.amount > 0 ? formatPeso(bucket.amount) : "₱0"}
                      </span>
                    </div>

                    {/* Bar Element */}
                    <div className="w-full flex-1 flex items-end justify-center">
                      <div
                        className="w-full max-w-[48px] rounded-t-lg transition-all duration-300 group-hover:brightness-110 shadow-2xs"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor:
                            bucket.amount > 0 ? bucket.colorHex : "#e5ded4",
                          minHeight: bucket.amount > 0 ? "15%" : "4px",
                        }}
                      />
                    </div>

                    {/* Time Window Label below bar */}
                    <div className="mt-2.5 text-center">
                      <span className="block text-xs sm:text-sm font-semibold text-ink">
                        {bucket.timeLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Breakdowns Grid (Payment Methods & Order Types) */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Payment Method Breakdown */}
            <div className="print-avoid-break rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-xs">
              <div className="border-b border-line/60 pb-3">
                <h3 className="font-display text-lg font-bold text-ink">
                  Payment Method Breakdown
                </h3>
                <p className="text-xs sm:text-sm text-ink-soft">
                  Distribution of gross sales by customer payment method
                </p>
              </div>

              <div className="mt-5 space-y-4">
                {summaryData.paymentMethodBreakdown.map((pm) => (
                  <div key={pm.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-3 w-3 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: pm.colorHex }}
                        />
                        <span className="font-semibold text-ink">
                          {pm.label}
                        </span>
                        <span className="text-xs text-ink-soft tabular-figures">
                          ({pm.orderCount}{" "}
                          {pm.orderCount === 1 ? "order" : "orders"})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink tabular-figures">
                          {formatPeso(pm.totalAmount)}
                        </span>
                        <span className="text-xs font-medium text-ink-soft tabular-figures w-12 text-right">
                          {pm.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pm.percentage}%`,
                          backgroundColor: pm.colorHex,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Type Breakdown */}
            <div className="print-avoid-break rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-xs">
              <div className="border-b border-line/60 pb-3">
                <h3 className="font-display text-lg font-bold text-ink">
                  Order Type Breakdown
                </h3>
                <p className="text-xs sm:text-sm text-ink-soft">
                  Fulfillment distribution across dining channels
                </p>
              </div>

              <div className="mt-5 space-y-4">
                {summaryData.orderTypeBreakdown.map((ot) => (
                  <div key={ot.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-3 w-3 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: ot.colorHex }}
                        />
                        <span className="font-semibold text-ink">
                          {ot.label}
                        </span>
                        <span className="text-xs text-ink-soft tabular-figures">
                          ({ot.orderCount}{" "}
                          {ot.orderCount === 1 ? "order" : "orders"})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink tabular-figures">
                          {formatPeso(ot.totalAmount)}
                        </span>
                        <span className="text-xs font-medium text-ink-soft tabular-figures w-12 text-right">
                          {ot.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${ot.percentage}%`,
                          backgroundColor: ot.colorHex,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Top 5 Best Selling Items (Ranked by Gross Sales desc, Units desc, MenuItemId asc) */}
          <div className="print-avoid-break rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-xs">
            <div className="border-b border-line/60 pb-3">
              <h3 className="font-display text-lg font-bold text-ink">
                Top 5 Best Selling Products
              </h3>
              <p className="text-xs sm:text-sm text-ink-soft">
                Leading items grouped by menu item ID, with category taxonomy and sales volume
              </p>
            </div>

            {summaryData.topSellingProducts.length === 0 ? (
              <div className="py-10 text-center text-sm text-ink-soft">
                No items sold yet in this period.
              </div>
            ) : (
              <div className="mt-4">
                {/* Desktop Table View (Hidden on mobile) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line/60 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                        <th className="py-3 px-3 w-16">Rank</th>
                        <th className="py-3 px-3">Product Name</th>
                        <th className="py-3 px-3">Category Path</th>
                        <th className="py-3 px-3 text-right">Units Sold</th>
                        <th className="py-3 px-3 text-right">Gross Sales</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/40">
                      {summaryData.topSellingProducts.map((item) => (
                        <tr
                          key={item.menuItemId}
                          className="transition hover:bg-paper/40"
                        >
                          <td className="py-3 px-3 font-semibold text-ink">
                            <span
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                item.rank === 1
                                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                                  : item.rank === 2
                                  ? "bg-slate-100 text-slate-700 border border-slate-300"
                                  : item.rank === 3
                                  ? "bg-orange-100 text-orange-800 border border-orange-300"
                                  : "bg-paper text-ink-soft border border-line"
                              }`}
                            >
                              {item.rank}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold text-ink">
                            {item.productName}
                          </td>
                          <td className="py-3 px-3 text-ink-soft">
                            <span className="inline-block rounded-md bg-paper px-2 py-0.5 text-xs font-medium text-ink-soft">
                              {item.categoryPath}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-ink tabular-figures">
                            {item.unitsSold.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-ink tabular-figures">
                            {formatPeso(item.grossSales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View (Visible only on small screens) */}
                <div className="sm:hidden space-y-3 pt-2">
                  {summaryData.topSellingProducts.map((item) => (
                    <div
                      key={item.menuItemId}
                      className="rounded-xl border border-line/70 bg-paper/30 p-3.5 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              item.rank === 1
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : item.rank === 2
                                ? "bg-slate-100 text-slate-700 border border-slate-300"
                                : item.rank === 3
                                ? "bg-orange-100 text-orange-800 border border-orange-300"
                                : "bg-paper text-ink-soft border border-line"
                            }`}
                          >
                            {item.rank}
                          </span>
                          <span className="font-semibold text-ink text-sm">
                            {item.productName}
                          </span>
                        </div>
                        <span className="font-semibold text-ink tabular-figures text-sm">
                          {formatPeso(item.grossSales)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-ink-soft pt-1 border-t border-line/40">
                        <span className="truncate max-w-[200px]">
                          {item.categoryPath}
                        </span>
                        <span className="font-medium text-ink tabular-figures">
                          {item.unitsSold} units
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
