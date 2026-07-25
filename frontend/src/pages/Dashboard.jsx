import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";

export default function Dashboard() {
  const { customer } = useCustomer();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .getDashboard(customer.id, days)
      .then((res) => {
        if (alive) setData(res.data);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load dashboard");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [customer.id, days]);

  if (loading) return <LoadingBlock label="Building your snapshot…" />;
  if (error) return <div className="error-state panel">{error}</div>;
  if (!data) return null;

  const { spend, pantry, topRecipes, profile } = data;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Welcome back, {customer.name.split(" ")[0]}</h1>
          <p>
            Your HealthyFood snapshot from the last {days} days — spend health,
            pantry status, and recipes you can cook now.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {[7, 30].map((d) => (
            <button
              key={d}
              type="button"
              className={`btn btn-sm ${days === d ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setDays(d)}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: "1rem" }}>
        <div className="stat-card">
          <div className="label">Total spend</div>
          <div className="value">{formatCurrency(spend.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Pantry items</div>
          <div className="value">{pantry.count}</div>
        </div>
        <div className="stat-card">
          <div className="label">Expiring soon</div>
          <div className="value" style={{ color: pantry.expiringSoon ? "#d4a017" : undefined }}>
            {pantry.expiringSoon}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2 style={{ fontSize: "1.15rem", marginBottom: "0.85rem" }}>
            Spend health mix
          </h2>
          <div className="progress-track" style={{ marginBottom: "1rem", height: 14 }}>
            <div
              className="progress-seg healthy"
              style={{ width: `${spend.healthyPct}%` }}
              title={`Healthy ${spend.healthyPct}%`}
            />
            <div
              className="progress-seg neutral"
              style={{ width: `${spend.neutralPct}%` }}
              title={`Neutral ${spend.neutralPct}%`}
            />
            <div
              className="progress-seg unhealthy"
              style={{ width: `${spend.unhealthyPct}%` }}
              title={`Unhealthy ${spend.unhealthyPct}%`}
            />
          </div>
          <div className="list">
            <SpendRow label="Healthy" amount={spend.healthy} pct={spend.healthyPct} tag="healthy" />
            <SpendRow label="Neutral" amount={spend.neutral} pct={spend.neutralPct} tag="neutral" />
            <SpendRow label="Unhealthy" amount={spend.unhealthy} pct={spend.unhealthyPct} tag="unhealthy" />
          </div>
        </section>

        <section className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
            <h2 style={{ fontSize: "1.15rem" }}>Cook from pantry</h2>
            <Link to="/app/recipes" className="btn btn-sm btn-outline">
              All recipes
            </Link>
          </div>
          <div className="list">
            {topRecipes.map((recipe) => (
              <Link
                key={recipe.id}
                to={`/app/recipes/${recipe.id}`}
                className="panel"
                style={{ padding: "0.9rem", boxShadow: "none", background: "#f7faf7" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                  <strong style={{ fontFamily: "var(--font-display)" }}>{recipe.name}</strong>
                  <span className="tag tag-healthy">{recipe.matchPercent}%</span>
                </div>
                <p style={{ color: "var(--text-muted)", marginTop: "0.35rem", fontSize: "0.9rem" }}>
                  {recipe.matchCount}/{recipe.totalIngredients} ingredients on hand ·{" "}
                  {recipe.prepTimeMinutes} min
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {profile ? (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <h2 style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>Your goals</h2>
          <div className="grid-3">
            <div>
              <div className="label" style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                Monthly budget
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.3rem", marginTop: "0.25rem" }}>
                {profile.budget_monthly != null
                  ? formatCurrency(profile.budget_monthly)
                  : "Not set"}
              </div>
            </div>
            <div>
              <div className="label" style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                Dietary preferences
              </div>
              <div style={{ marginTop: "0.35rem" }}>
                {Array.isArray(profile.dietary_preferences) && profile.dietary_preferences.length
                  ? profile.dietary_preferences.join(", ")
                  : "None set"}
              </div>
            </div>
            <div>
              <div className="label" style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                Health goals
              </div>
              <div style={{ marginTop: "0.35rem" }}>
                {Array.isArray(profile.health_goals) && profile.health_goals.length
                  ? profile.health_goals.join(", ")
                  : "None set"}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel" style={{ marginTop: "1rem", background: "var(--tertiary)", borderColor: "transparent" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.4rem" }}>Set a budget & goals</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.85rem" }}>
            Add your monthly budget, dietary preferences, and health goals so recommendations can work harder for you.
          </p>
          <Link to="/app/profile" className="btn btn-primary">
            Open profile
          </Link>
        </section>
      )}
    </>
  );
}

function SpendRow({ label, amount, pct, tag }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
        <span className={`tag tag-${tag}`}>{label}</span>
        <span style={{ color: "var(--text-muted)" }}>{pct}%</span>
      </div>
      <strong>{formatCurrency(amount)}</strong>
    </div>
  );
}
