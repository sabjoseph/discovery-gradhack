import { useEffect, useState } from "react";
import { useCustomer } from "../context/CustomerContext";
import { api } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";

export default function Rewards() {
  const { customer } = useCustomer();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .getMilestones(customer.id)
      .then((res) => {
        if (alive) setData(res.data);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load rewards");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [customer.id]);

  if (loading) return <LoadingBlock label="Checking your milestones…" />;
  if (error) return <div className="error-state panel">{error}</div>;
  if (!data) return null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Rewards & milestones</h1>
          <p>
            Habit tracking based on your real spend, pantry, and recipe match —
            encouragement while you build healthier routines.
          </p>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: "1rem" }}>
        <div className="stat-card">
          <div className="label">Healthy spend (30d)</div>
          <div className="value">{data.stats.healthySpendPct}%</div>
        </div>
        <div className="stat-card">
          <div className="label">Pantry size</div>
          <div className="value">{data.stats.pantryCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">Best recipe match</div>
          <div className="value">{data.stats.bestRecipeMatch}%</div>
        </div>
      </div>

      <div className="list">
        {data.milestones.map((m) => (
          <article key={m.id} className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start" }}>
              <div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
                  <h2 style={{ fontSize: "1.1rem" }}>{m.name}</h2>
                  <span className={`tag ${m.achieved ? "tag-healthy" : "tag-neutral"}`}>
                    {m.achieved ? "Achieved" : m.rewardStatus}
                  </span>
                </div>
                <p style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>{m.description}</p>
                <div className="progress-track" style={{ marginTop: "0.85rem" }}>
                  <div
                    className="progress-seg healthy"
                    style={{ width: `${m.percent}%` }}
                  />
                </div>
                <div style={{ marginTop: "0.45rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                  {m.current} / {m.target}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--primary)" }}>
                  +{m.rewardValue}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>points</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
