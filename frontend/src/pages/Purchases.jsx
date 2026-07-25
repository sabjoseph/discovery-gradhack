import { useCallback, useEffect, useMemo, useState } from "react";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency, formatDate } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";
import SegmentedRing from "../components/SegmentedRing";
import "./Purchases.css";

const RECENT_LIMIT = 5;

function retailerBucket(name) {
  const label = (name || "").toLowerCase();
  if (label.includes("checker")) return "checkers";
  if (label.includes("woolworth") || label.includes("woolies")) return "woolies";
  return "other";
}

// The deployed API may predate /summary, so rebuild the same figures from the
// basket list and profile budget.
function summaryFromBaskets(baskets, budgetMonthly) {
  const dated = (baskets || []).filter((b) => b.purchaseDate);
  if (dated.length === 0) return null;

  const latest = dated.reduce(
    (max, b) => (b.purchaseDate > max ? b.purchaseDate : max),
    dated[0].purchaseDate
  );
  const monthKey = latest.slice(0, 7);
  const monthBaskets = dated.filter((b) => b.purchaseDate.slice(0, 7) === monthKey);

  let monthSpend = 0;
  let checkersSpend = 0;
  let wooliesSpend = 0;
  let otherSpend = 0;

  for (const basket of monthBaskets) {
    const total = Number(basket.total || 0);
    monthSpend += total;
    const bucket = retailerBucket(basket.retailer);
    if (bucket === "checkers") checkersSpend += total;
    else if (bucket === "woolies") wooliesSpend += total;
    else otherSpend += total;
  }

  const hasBudget = budgetMonthly != null && !Number.isNaN(Number(budgetMonthly));
  const budget = hasBudget ? Number(budgetMonthly) : null;

  return {
    monthLabel: new Date(`${monthKey}-01T00:00:00Z`).toLocaleString("en-ZA", {
      month: "long",
      year: "numeric",
    }),
    budgetMonthly: budget,
    monthSpend,
    checkersSpend,
    wooliesSpend,
    otherSpend,
    remaining: budget != null ? budget - monthSpend : null,
    usedPct:
      budget && budget > 0 ? Math.min(100, Math.round((monthSpend / budget) * 100)) : 0,
    basketCount: monthBaskets.length,
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
  }, [customer.id]);

  const loadPage = useCallback(
    async (page, append) => {
      const res = await api.getPurchases(customer.id, {
        page,
        limit: RECENT_LIMIT,
      });
      setBaskets((prev) => (append ? [...prev, ...(res.data || [])] : res.data || []));
      setPagination(res.pagination || { page, hasMore: false, total: 0 });
    },
    [customer.id]
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
  }, [loadPage]);

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

  const recent = baskets.slice(0, RECENT_LIMIT);
  const older = baskets.slice(RECENT_LIMIT);
  const olderCount = Math.max(0, (pagination.total || 0) - RECENT_LIMIT);
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
                    : `${formatCurrency(summary.monthSpend)} spent this month`
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
            </div>
          )}
        </section>

        {error && <div className="error-state glass ph-error">{error}</div>}

        <section className="ph-history">
          <div className="ph-history-head">
            <h2>Recent</h2>
            <p>{pagination.total} baskets total</p>
          </div>

          <div className="ph-list">
            {recent.length === 0 ? (
              <div className="glass ph-empty">No purchases yet.</div>
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

          {(olderCount > 0 || older.length > 0) && (
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
    </div>
  );
}
