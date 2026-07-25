import { useCallback, useEffect, useState } from "react";
import { useCustomer } from "../context/CustomerContext";
import { api, formatDate } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";

export default function Pantry() {
  const { customer } = useCustomer();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .getPantry(customer.id)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || "Failed to load pantry"))
      .finally(() => setLoading(false));
  }, [customer.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function markUsed(item) {
    setBusyId(item.id);
    try {
      await api.usePantryItem(customer.id, item.id, 1);
      await load();
    } catch (err) {
      setError(err.message || "Could not update item");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) return <LoadingBlock label="Checking your kitchen…" />;
  if (error && !data) return <div className="error-state panel">{error}</div>;

  const items = data?.items || [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Pantry</h1>
          <p>
            What you likely still have on hand — estimated from your last 30 days
            of purchases. Mark items as used when you cook with them.
          </p>
        </div>
        <div className="stat-card" style={{ minWidth: 160 }}>
          <div className="label">On hand</div>
          <div className="value">{data?.count ?? 0}</div>
          <div style={{ color: "var(--warning)", fontWeight: 600, marginTop: "0.25rem" }}>
            {data?.expiringSoonCount ?? 0} expiring soon
          </div>
        </div>
      </div>

      {error && <div className="error-state" style={{ marginBottom: "1rem" }}>{error}</div>}

      <div className="list">
        {items.length === 0 ? (
          <div className="empty-state panel">Your pantry is empty.</div>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="panel"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "1rem",
                alignItems: "center",
                borderColor: item.expired
                  ? "rgba(214,69,69,0.35)"
                  : item.expiringSoon
                    ? "rgba(212,160,23,0.45)"
                    : undefined,
              }}
            >
              <div>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem" }}>
                  {item.name}
                </strong>
                <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                  <span className={`tag tag-${item.healthTag}`}>{item.healthTag}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
                    {item.category}
                  </span>
                </div>
                <div style={{ color: "var(--text-muted)", marginTop: "0.45rem", fontSize: "0.9rem" }}>
                  Qty {item.quantity} · added {formatDate(item.addedDate)} ·{" "}
                  {item.expired
                    ? "past expiry estimate"
                    : item.daysLeft != null
                      ? `~${item.daysLeft} days left`
                      : "no expiry"}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={busyId === item.id}
                onClick={() => markUsed(item)}
              >
                {busyId === item.id ? "Updating…" : "Mark used"}
              </button>
            </article>
          ))
        )}
      </div>
    </>
  );
}
