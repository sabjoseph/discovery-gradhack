import { useEffect, useState } from "react";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency, formatDate } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";

export default function Purchases() {
  const { customer } = useCustomer();
  const [baskets, setBaskets] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .getPurchases(customer.id)
      .then((res) => {
        if (alive) setBaskets(res.data || []);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load purchases");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [customer.id]);

  if (loading) return <LoadingBlock label="Loading purchase history…" />;
  if (error) return <div className="error-state panel">{error}</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Purchases</h1>
          <p>
            Your real shopping history — {baskets.length} baskets from Checkers
            and Woolworths.
          </p>
        </div>
      </div>

      <div className="list">
        {baskets.map((basket) => {
          const open = openId === basket.id;
          return (
            <article key={basket.id} className="panel" style={{ padding: 0, overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : basket.id)}
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  padding: "1rem 1.15rem",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div>
                  <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem" }}>
                    {formatDate(basket.purchaseDate)}
                  </strong>
                  <div style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    {basket.retailer} · {basket.itemCount} items
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800 }}>{formatCurrency(basket.total)}</div>
                  <div style={{ color: "var(--primary)", fontWeight: 700, marginTop: "0.2rem" }}>
                    {open ? "Hide" : "View"} items
                  </div>
                </div>
              </button>

              {open && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 1.15rem 1.1rem" }}>
                  <div className="list">
                    {basket.items.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: "0.75rem",
                          alignItems: "center",
                          padding: "0.55rem 0",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.3rem", flexWrap: "wrap" }}>
                            <span className={`tag tag-${item.healthTag}`}>{item.healthTag}</span>
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                              {item.category} · qty {item.quantity}
                            </span>
                          </div>
                        </div>
                        <strong>{formatCurrency(item.lineTotal)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
