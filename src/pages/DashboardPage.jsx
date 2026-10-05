import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import InventoryTab from "../components/inventory/InventoryTab";
import MenuRecipesTab from "../components/menu/MenuRecipesTab";
import SalesAnalyticsTab from "../components/sales/SalesAnalyticsTab";
import logo from "../assets/B11 WHITE.png";

const TABS = [
  { id: "inventory", label: "Inventory" },
  { id: "menu", label: "Menu & Recipes" },
  { id: "sales", label: "Sales Analytics & Reports" },
];

const STORAGE_KEY = "b11_dashboard_active_tab";

function getStoredTab() {
  try {
    const val = sessionStorage.getItem(STORAGE_KEY);
    if (val && TABS.some((t) => t.id === val)) {
      return val;
    }
  } catch {
    // sessionStorage read failure (e.g. cookies disabled)
  }
  return "inventory";
}

export default function DashboardPage() {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState(getStoredTab);
  const [mountedTabs, setMountedTabs] = useState(() => new Set([activeTab]));
  const tabRefs = useRef({});

  function handleSelectTab(tabId) {
    setActiveTab(tabId);
    setMountedTabs((prev) => (prev.has(tabId) ? prev : new Set(prev).add(tabId)));
    try {
      sessionStorage.setItem(STORAGE_KEY, tabId);
    } catch {
      // sessionStorage write failure
    }
  }

  function handleKeyDown(e, currentIndex) {
    if (e.key === "ArrowRight") {
      const nextIndex = (currentIndex + 1) % TABS.length;
      handleSelectTab(TABS[nextIndex].id);
      tabRefs.current[TABS[nextIndex].id]?.focus();
    } else if (e.key === "ArrowLeft") {
      const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      handleSelectTab(TABS[prevIndex].id);
      tabRefs.current[TABS[prevIndex].id]?.focus();
    }
  }

  useEffect(() => {
    const activeEl = tabRefs.current[activeTab];
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-paper pb-16">
      {/* Header */}
      <header style={{ backgroundColor: "#2b211b" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
          <img src={logo} alt="Block 11 Cafe" className="h-12 sm:h-16 md:h-20 lg:h-24 w-auto object-contain shrink-0" />
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-xs sm:text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>Admin</span>
            <button
              onClick={logout}
              title="Sign out"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border p-2.5 transition active:scale-95"
              style={{ borderColor: "rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.85)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* POS Category Pill Tab Bar */}
      <nav aria-label="Dashboard sections" className="sticky top-0 z-20 border-b border-line/60 bg-paper/95 backdrop-blur-xs">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-4">
          <div
            role="tablist"
            aria-label="Dashboard views"
            className="no-scrollbar flex flex-nowrap items-center gap-2.5 overflow-x-auto py-1 sm:gap-3.5"
          >
            {TABS.map((tab, idx) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => (tabRefs.current[tab.id] = el)}
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`tabpanel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => handleSelectTab(tab.id)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  className={`flex min-h-[48px] shrink-0 cursor-pointer items-center justify-center rounded-full px-5 text-sm font-semibold whitespace-nowrap transition-all duration-150 sm:min-h-[54px] sm:px-6 sm:text-base ${
                    isActive
                      ? "border border-ink bg-ink text-paper shadow-xs"
                      : "border border-line bg-surface text-ink-soft hover:bg-paper/70 hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Persistent Tab Content Panels */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          id="tabpanel-inventory"
          role="tabpanel"
          aria-labelledby="tab-inventory"
          hidden={activeTab !== "inventory"}
          className={activeTab !== "inventory" ? "hidden" : undefined}
        >
          {mountedTabs.has("inventory") && <InventoryTab />}
        </div>

        <div
          id="tabpanel-menu"
          role="tabpanel"
          aria-labelledby="tab-menu"
          hidden={activeTab !== "menu"}
          className={activeTab !== "menu" ? "hidden" : undefined}
        >
          {mountedTabs.has("menu") && <MenuRecipesTab />}
        </div>

        <div
          id="tabpanel-sales"
          role="tabpanel"
          aria-labelledby="tab-sales"
          hidden={activeTab !== "sales"}
          className={activeTab !== "sales" ? "hidden" : undefined}
        >
          {mountedTabs.has("sales") && <SalesAnalyticsTab />}
        </div>
      </main>
    </div>
  );
}
