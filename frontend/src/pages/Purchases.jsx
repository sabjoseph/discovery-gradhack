import { useCallback, useEffect, useMemo, useState } from "react";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency, formatDate } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";
import "./Purchases.css";

export default function Purchases() {
  const { customer } = useCustomer();
  const [meta, setMeta] = useState(null);
  const [baskets, setBaskets] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, hasMore: false, total: 0 });
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retailer, setRetailer] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filters = useMemo(
    () => ({
      retailer: retailer || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      limit: 8,
    }),
    [retailer, fromDate, toDate]
  );

  const loadPage = useCallback(
    async (page, append) => {
      const res = await api.getPurchases(customer.id, { ...filters, page });
      setBaskets((prev) => (append ? [...prev, ...(res.data || [])] : res.data || []));
      setPagination(res.pagination || { page, hasMore: false, total: 0 });
    },
    [customer.id, filters]
  );

  useEffect(() => {
    let alive = true;
    api
      .getPurchasesMeta(customer.id)
      .then((res) => {
        if (alive) setMeta(res.data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [customer.id]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setOpenId(null);
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

  async function loadMore() {
    if (!pagination.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(pagination.page + 1, true);
    } catch (err) {
      setError(err.message || "Failed to load more baskets");
    } finally {
      setLoadingMore(false);
    }
  }

  const summary = useMemo(() => {
    const totalSpend = baskets.reduce((sum, b) => sum + Number(b.total || 0), 0);
    const itemCount = baskets.reduce((sum, b) => sum + Number(b.itemCount || 0), 0);
    return { totalSpend, itemCount };
  }, [baskets]);

  if (loading && baskets.length === 0) {
    return <LoadingBlock label="Loading purchase history…" />;
  }

  return (
    <div className="ph">
      <div className="ph-hero" aria-hidden="true" />

      <div className="ph-layout">
        <section className="ph-main">
          <header className="ph-header glass">
            <div>
              <p className="ph-kicker">Shopping history</p>
              <h1>Purchases</h1>
              <p>
                Your real shopping trail — {meta?.basketCount ?? pagination.total}{" "}
                baskets, newest first. Expand any receipt to see line items and
                HealthyFood tags.
              </p>
            </div>
            <div className="ph-filters">
              <label>
                Retailer
                <select value={retailer} onChange={(e) => setRetailer(e.target.value)}>
                  <option value="">All retailers</option>
                  {(meta?.retailers || []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                From
                <input
                  type="date"
                  value={fromDate}
                  min={meta?.minDate?.slice(0, 10)}
                  max={meta?.maxDate?.slice(0, 10)}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={toDate}
                  min={meta?.minDate?.slice(0, 10)}
                  max={meta?.maxDate?.slice(0, 10)}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </label>
            </div>
          </header>

          {error && <div className="error-state glass ph-error">{error}</div>}

          <div className="ph-list">
            {baskets.length === 0 && !loading ? (
              <div className="glass ph-empty">No baskets match these filters.</div>
            ) : (
              baskets.map((basket) => {
                const open = openId === basket.id;
                const detail = details[basket.id];
                return (
                  <article key={basket.id} className={`glass ph-basket ${open ? "is-open" : ""}`}>
                    <button
                      type="button"
                      className="ph-basket-toggle"
                      onClick={() => toggleBasket(basket.id)}
                      aria-expanded={open}
                    >
                      <div>
                        <span className="ph-qty-badge">{basket.itemCount} items</span>
                        <h2>{formatDate(basket.purchaseDate)}</h2>
                        <p>
                          {basket.retailer} · {basket.id}
                        </p>
                      </div>
                      <div className="ph-basket-total">
                        <strong>{formatCurrency(basket.total)}</strong>
                        <span>{open ? "Hide receipt" : "View receipt"}</span>
                      </div>
                    </button>

                    {open && (
                      <div className="ph-basket-body">
                        {detailLoading === basket.id && (
                          <p className="ph-loading">Loading line items…</p>
                        )}
                        {detail && (
                          <>
                            <div className="ph-mix">
                              <div
                                className="ph-mix-bar"
                                title={`Healthy ${detail.mix.healthyPct}%`}
                              >
                                <div
                                  className="healthy"
                                  style={{ width: `${detail.mix.healthyPct}%` }}
                                />
                                <div
                                  className="neutral"
                                  style={{ width: `${detail.mix.neutralPct}%` }}
                                />
                                <div
                                  className="unhealthy"
                                  style={{ width: `${detail.mix.unhealthyPct}%` }}
                                />
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
                                    <span className={`ph-health tag tag-${item.healthTag}`}>
                                      {item.healthTag}
                                    </span>
                                    <strong>{formatCurrency(item.lineTotal)}</strong>
                                  </div>
                                  <h3>{item.name}</h3>
                                  <p>
                                    {item.category} · qty {item.quantity} ·{" "}
                                    {formatCurrency(item.unitPrice)} each
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
              })
            )}
          </div>

          {pagination.hasMore && (
            <button
              type="button"
              className="ph-more"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more baskets"}
            </button>
          )}
        </section>

        <aside className="ph-side">
          <section className="glass ph-side-card">
            <p className="ph-side-label">Loaded spend</p>
            <strong>{formatCurrency(summary.totalSpend)}</strong>
            <p>
              Across {baskets.length} of {pagination.total} baskets
              {filters.retailer || filters.from || filters.to ? " (filtered)" : ""}
            </p>
          </section>

          <section className="glass ph-side-card">
            <p className="ph-side-label">Line items shown</p>
            <strong>{summary.itemCount}</strong>
            <p>Expand a receipt to load its products on demand.</p>
          </section>

          <section className="glass ph-side-card ph-note">
            <h3>Read-only history</h3>
            <p>
              Baskets come from your HealthyFood till data. Manual entry and
              receipt scanning are not part of this build.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
