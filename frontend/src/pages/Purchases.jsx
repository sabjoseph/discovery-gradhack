import { useCallback, useEffect, useMemo, useState } from "react";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency, formatDate } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";
import SegmentedRing from "../components/SegmentedRing";
import AddPurchaseModal from "../components/AddPurchaseModal";
import "./Purchases.css";

const RECENT_LIMIT = 5;

function retailerBucket(name) {
  const label = (name || "").toLowerCase();
  if (label.includes("checker")) return "checkers";
  if (label.includes("woolworth") || label.includes("woolies")) return "woolies";
  return "other";
}

// The deployed API may predate /summary, so rebuild the same figures from the
// basket list and profile budget. Mirrors the backend: rolling 30-day window
// ending at the latest purchase.
function summaryFromBaskets(baskets, budgetMonthly) {
  const dated = (baskets || []).filter((b) => b.purchaseDate);
  if (dated.length === 0) return null;

  const latestDate = dated.reduce(
    (max, b) => (b.purchaseDate > max ? b.purchaseDate : max),
    dated[0].purchaseDate
  );
  const windowEnd = new Date(latestDate);
  const windowStart = new Date(windowEnd);
  windowStart.setDate(windowStart.getDate() - 29);
  windowStart.setHours(0, 0, 0, 0);

  const active = {
    monthSpend: 0,
    checkersSpend: 0,
    wooliesSpend: 0,
    otherSpend: 0,
    basketCount: 0,
  };

  for (const basket of dated) {
    const d = new Date(basket.purchaseDate);
    if (d < windowStart || d > windowEnd) continue;
    const total = Number(basket.total || 0);
    active.monthSpend += total;
    active.basketCount += 1;
    const bucket = retailerBucket(basket.retailer);
    if (bucket === "checkers") active.checkersSpend += total;
    else if (bucket === "woolies") active.wooliesSpend += total;
    else active.otherSpend += total;
  }

  const hasBudget = budgetMonthly != null && !Number.isNaN(Number(budgetMonthly));
  const budget = hasBudget ? Number(budgetMonthly) : null;

  return {
    monthLabel: "Last 30 days",
    budgetMonthly: budget,
    monthSpend: active.monthSpend,
    checkersSpend: active.checkersSpend,
    wooliesSpend: active.wooliesSpend,
    otherSpend: active.otherSpend,
    remaining: budget != null ? budget - active.monthSpend : null,
    usedPct:
      budget && budget > 0
        ? Math.min(100, Math.round((active.monthSpend / budget) * 100))
        : 0,
    basketCount: active.basketCount,
    partial: true,
  };
}

const SHOP_LINKS = [
  {
    id: "checkers",
    name: "Checkers Sixty60",
    blurb: "Groceries in about 60 minutes",
    href: "https://www.sixty60.co.za/",
    logo: "/checkers-sixty60-logo.png",
  },
  {
    id: "woolies",
    name: "Woolies Dash",
    blurb: "On-demand via Woolworths Online",
    href: "https://www.woolworths.co.za/",
    logo: "/woolies-dash-logo.png",
  },
];

function BasketCard({
  basket,
  open,
  detail,
  detailLoading,
  onToggle,
}) {
  return (
    <article className={`glass ph-basket ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="ph-basket-toggle"
        onClick={() => onToggle(basket.id)}
        aria-expanded={open}
      >
        <div>
          <span className="ph-qty-badge">{basket.itemCount} items</span>
          <h3>{formatDate(basket.purchaseDate)}</h3>
          <p>{basket.retailer}</p>
        </div>
        <div className="ph-basket-total">
          <strong>{formatCurrency(basket.total)}</strong>
          <span>{open ? "Hide" : "Receipt"}</span>
        </div>
      </button>

      {open && (
        <div className="ph-basket-body">
          {detailLoading && <p className="ph-loading">Loading line items…</p>}
          {detail && (
            <>
              <div className="ph-mix">
                <div className="ph-mix-bar">
                  <div className="healthy" style={{ width: `${detail.mix.healthyPct}%` }} />
                  <div className="neutral" style={{ width: `${detail.mix.neutralPct}%` }} />
                  <div className="unhealthy" style={{ width: `${detail.mix.unhealthyPct}%` }} />
                </div>
                <div className="ph-mix-legend">
                  <span>Healthy {detail.mix.healthyPct}%</span>
                  <span>Neutral {detail.mix.neutralPct}%</span>
                  <span>Unhealthy {detail.mix.unhealthyPct}%</span>
                </div>
              </div>
              <div className="ph-items">
                {detail.items.map((item) => (
                  <div key={item.id} className="ph-item">
                    <div className="ph-item-top">
                      <span className={`tag tag-${item.healthTag}`}>{item.healthTag}</span>
                      <strong>{formatCurrency(item.lineTotal)}</strong>
                    </div>
                    <h4>{item.name}</h4>
                    <p>
                      {item.category} · qty {item.quantity} · {formatCurrency(item.unitPrice)} each
                    </p>
                  </div>
                ))}
              </div>
              {detail.receipt?.imageUrl && (
                <a
                  className="ph-receipt-link"
                  href={detail.receipt.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img src={detail.receipt.imageUrl} alt="Receipt" loading="lazy" />
                  <span>View receipt image</span>
                </a>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

export default function Purchases() {
  const { customer } = useCustomer();
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");
  const [baskets, setBaskets] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, hasMore: false, total: 0 });
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ retailer: "", from: "", to: "" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setSummaryError("");

    async function loadSummary() {
      try {
        const res = await api.getPurchasesSummary(customer.id);
        if (alive) setSummary(res.data);
        return;
      } catch {
        // fall through to the client-side rebuild below
      }

      try {
        const [profileRes, basketRes] = await Promise.all([
          api.getProfile(customer.id).catch(() => null),
          api.getPurchases(customer.id, { limit: 50, page: 1 }),
        ]);
        const rebuilt = summaryFromBaskets(
          basketRes.data,
          profileRes?.data?.profile?.budget_monthly
        );
        if (!alive) return;
        if (rebuilt) setSummary(rebuilt);
        else setSummaryError("No spend recorded yet");
      } catch (err) {
        if (alive) {
          setSummary(null);
          setSummaryError(err.message || "Could not load purchase summary");
        }
      }
    }

    loadSummary();
    return () => {
      alive = false;
    };
  }, [customer.id, refreshKey]);

  const loadPage = useCallback(
    async (page, append) => {
      const res = await api.getPurchases(customer.id, {
        page,
        limit: RECENT_LIMIT,
        ...(filters.retailer ? { retailer: filters.retailer } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      });
      setBaskets((prev) => (append ? [...prev, ...(res.data || [])] : res.data || []));
      setPagination(res.pagination || { page, hasMore: false, total: 0 });
    },
    [customer.id, filters]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setOpenId(null);
    setShowOlder(false);
    loadPage(1, false)
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load purchases");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loadPage, refreshKey]);

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4200);
  }

  function handlePurchaseSaved(result) {
    setShowAdd(false);
    setDetails({});
    setRefreshKey((k) => k + 1);
    const pantryBits = [];
    if (result?.pantry?.created) pantryBits.push(`${result.pantry.created} new pantry item${result.pantry.created === 1 ? "" : "s"}`);
    if (result?.pantry?.updated) pantryBits.push(`${result.pantry.updated} topped up`);
    showToast(
      `Purchase saved${pantryBits.length ? ` — ${pantryBits.join(", ")}` : ""}. Recipes and budget updated.`
    );
  }

  async function toggleBasket(basketId) {
    if (openId === basketId) {
      setOpenId(null);
      return;
    }
    setOpenId(basketId);
    if (details[basketId]) return;

    setDetailLoading(basketId);
    try {
      const res = await api.getPurchaseBasket(customer.id, basketId);
      setDetails((prev) => ({ ...prev, [basketId]: res.data }));
    } catch (err) {
      setError(err.message || "Failed to load basket items");
    } finally {
      setDetailLoading(null);
    }
  }

  async function openOlder() {
    const next = !showOlder;
    setShowOlder(next);
    if (!next || baskets.length > RECENT_LIMIT || !pagination.hasMore) return;

    setLoadingOlder(true);
    try {
      await loadPage(pagination.page + 1, true);
    } catch (err) {
      setError(err.message || "Failed to load earlier purchases");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function loadMoreOlder() {
    if (!pagination.hasMore || loadingOlder) return;
    setLoadingOlder(true);
    try {
      await loadPage(pagination.page + 1, true);
    } catch (err) {
      setError(err.message || "Failed to load earlier purchases");
    } finally {
      setLoadingOlder(false);
    }
  }

  const ringMax = useMemo(() => {
    if (!summary) return 1;
    if (summary.budgetMonthly && summary.budgetMonthly > 0) return summary.budgetMonthly;
    return Math.max(summary.monthSpend || 0, 1);
  }, [summary]);

  const searchTerm = search.trim().toLowerCase();
  const visibleBaskets = searchTerm
    ? baskets.filter(
        (b) =>
          (b.retailer || "").toLowerCase().includes(searchTerm) ||
          formatDate(b.purchaseDate).toLowerCase().includes(searchTerm) ||
          (b.id || "").toLowerCase().includes(searchTerm)
      )
    : baskets;

  const recent = searchTerm ? visibleBaskets : visibleBaskets.slice(0, RECENT_LIMIT);
  const older = searchTerm ? [] : visibleBaskets.slice(RECENT_LIMIT);
  const olderCount = Math.max(0, (pagination.total || 0) - RECENT_LIMIT);
  const hasActiveFilters = Boolean(searchTerm || filters.retailer || filters.from || filters.to);
  const ringKey = summary?.monthLabel || "summary";

  const remaining = summary?.remaining;
  const remainingOver = remaining != null && remaining < 0;
  const remainingValue = remaining == null ? 0 : Math.max(0, remaining);

  const ringSegments = useMemo(() => {
    if (!summary) return [];
    const items = [
      {
        id: "checkers",
        label: "Checkers",
        value: summary.checkersSpend,
        color: "#00a651",
      },
      {
        id: "woolies",
        label: "Woolies",
        value: summary.wooliesSpend,
        color: "#0a2240",
      },
    ];

    if (summary.otherSpend > 0) {
      items.push({
        id: "other",
        label: "Other",
        value: summary.otherSpend,
        color: "#94a3b8",
      });
    }

    if (remainingOver) {
      items.push({
        id: "over",
        label: "Over budget",
        value: Math.abs(remaining),
        color: "#d64545",
      });
    } else if (summary.budgetMonthly != null) {
      items.push({
        id: "left",
        label: "Remaining",
        value: remainingValue,
        color: "#7bbc43",
      });
    }

    return items;
  }, [summary, remaining, remainingOver, remainingValue]);

  const legendItems = useMemo(() => {
    if (!summary) return [];
    const items = [
      {
        id: "checkers",
        label: "Checkers",
        value: summary.checkersSpend,
        color: "#00a651",
      },
      {
        id: "woolies",
        label: "Woolies",
        value: summary.wooliesSpend,
        color: "#0a2240",
      },
    ];
    if (summary.budgetMonthly != null) {
      items.push({
        id: "left",
        label: remainingOver ? "Over budget" : "Remaining",
        value: Math.abs(remaining ?? 0),
        color: remainingOver ? "#d64545" : "#7bbc43",
      });
    }
    return items;
  }, [summary, remaining, remainingOver]);

  if (loading && baskets.length === 0) {
    return <LoadingBlock label="Loading purchases…" />;
  }

  return (
    <div className="ph">
      <div className="ph-hero" aria-hidden="true" />

      <div className="ph-shell">
        <section className="glass ph-summary" aria-label="Purchase summary">
          <div className="ph-summary-top">
            <div className="ph-summary-copy">
              <p className="ph-kicker">Purchase summary</p>
              <h1>{summary?.monthLabel || "This month"}</h1>
              <p>
                {summary
                  ? summary.budgetMonthly != null
                    ? `${formatCurrency(summary.monthSpend)} spent of ${formatCurrency(summary.budgetMonthly)} budget`
                    : `${formatCurrency(summary.monthSpend)} spent in the last 30 days`
                  : summaryError || "Loading summary…"}
              </p>
            </div>

            <div className="ph-shop-stack" aria-label="Start a new purchase">
              <span className="ph-shop-label">Shop</span>
              <div className="ph-shop-links">
                {SHOP_LINKS.map((shop) => (
                  <a
                    key={shop.id}
                    className="ph-shop-card"
                    href={shop.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Shop on ${shop.name}`}
                    title={shop.blurb}
                  >
                    <img src={shop.logo} alt={shop.name} className="ph-shop-logo" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="ph-summary-rule" aria-hidden="true" />

          {summary && (
            <div className="ph-summary-body">
              <SegmentedRing
                key={ringKey}
                segments={ringSegments}
                max={ringMax}
                size={210}
                stroke={18}
                durationMs={1400}
              >
                <strong>{formatCurrency(summary.monthSpend)}</strong>
                <span>Total spent</span>
              </SegmentedRing>

              <ul className="ph-key">
                {legendItems.map((item) => (
                  <li key={item.id}>
                    <span
                      className="ph-key-swatch"
                      style={{ background: item.color }}
                      aria-hidden
                    />
                    <div>
                      <strong>{item.label}</strong>
                      <span>{formatCurrency(item.value)}</span>
                    </div>
                  </li>
                ))}
                {summary.budgetMonthly != null && (
                  <li className="ph-key-budget">
                    <span className="ph-key-swatch is-budget" aria-hidden />
                    <div>
                      <strong>Budget</strong>
                      <span>{formatCurrency(summary.budgetMonthly)}</span>
                    </div>
                  </li>
                )}
              </ul>

              <button
                type="button"
                className="ph-add-cta"
                onClick={() => setShowAdd(true)}
              >
                <span className="ph-add-cta-icon" aria-hidden>📷</span>
                <strong>Add purchase</strong>
                <span className="ph-add-cta-sub">
                  Snap or upload your till slip — we'll read it for you
                </span>
              </button>
            </div>
          )}

          {!summary && (
            <button
              type="button"
              className="ph-add-cta"
              onClick={() => setShowAdd(true)}
            >
              <span className="ph-add-cta-icon" aria-hidden>📷</span>
              <strong>Add purchase</strong>
              <span className="ph-add-cta-sub">
                Snap or upload your till slip — we'll read it for you
              </span>
            </button>
          )}
        </section>

        {error && <div className="error-state glass ph-error">{error}</div>}

        <section className="ph-history">
          <div className="ph-history-head">
            <h2>{searchTerm ? "Search results" : "Recent"}</h2>
            <p>{pagination.total} baskets total</p>
          </div>

          <div className="glass ph-toolbar" role="search">
            <input
              type="search"
              className="ph-search"
              placeholder="Search purchases…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search purchases"
            />
            <select
              value={filters.retailer}
              onChange={(e) => setFilters((f) => ({ ...f, retailer: e.target.value }))}
              aria-label="Filter by store"
            >
              <option value="">All stores</option>
              <option value="Checkers">Checkers</option>
              <option value="Woolworths">Woolworths</option>
            </select>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              aria-label="From date"
            />
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              aria-label="To date"
            />
            {hasActiveFilters && (
              <button
                type="button"
                className="ph-clear"
                onClick={() => {
                  setSearch("");
                  setFilters({ retailer: "", from: "", to: "" });
                }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="ph-list">
            {recent.length === 0 ? (
              <div className="glass ph-empty">
                {hasActiveFilters
                  ? "No purchases match your search or filters."
                  : "No purchases yet. Tap “Add purchase” to scan your first receipt."}
              </div>
            ) : (
              recent.map((basket) => (
                <BasketCard
                  key={basket.id}
                  basket={basket}
                  open={openId === basket.id}
                  detail={details[basket.id]}
                  detailLoading={detailLoading === basket.id}
                  onToggle={toggleBasket}
                />
              ))
            )}
          </div>

          {!searchTerm && (olderCount > 0 || older.length > 0) && (
            <div className="ph-older">
              <button
                type="button"
                className="ph-older-toggle"
                onClick={openOlder}
                aria-expanded={showOlder}
              >
                <span>
                  {showOlder ? "Hide earlier purchases" : `Earlier purchases (${olderCount})`}
                </span>
                <span className="ph-older-chevron" aria-hidden>
                  {showOlder ? "▴" : "▾"}
                </span>
              </button>

              {showOlder && (
                <div className="ph-older-body">
                  {loadingOlder && older.length === 0 && (
                    <p className="ph-loading">Loading earlier baskets…</p>
                  )}
                  <div className="ph-list">
                    {older.map((basket) => (
                      <BasketCard
                        key={basket.id}
                        basket={basket}
                        open={openId === basket.id}
                        detail={details[basket.id]}
                        detailLoading={detailLoading === basket.id}
                        onToggle={toggleBasket}
                      />
                    ))}
                  </div>
                  {pagination.hasMore && (
                    <button
                      type="button"
                      className="ph-more"
                      onClick={loadMoreOlder}
                      disabled={loadingOlder}
                    >
                      {loadingOlder ? "Loading…" : "Load more"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className="ph-toast" role="status">
          {toast}
        </div>
      )}

      {showAdd && (
        <AddPurchaseModal
          customerId={customer.id}
          onClose={() => setShowAdd(false)}
          onSaved={handlePurchaseSaved}
        />
      )}
    </div>
  );
}
