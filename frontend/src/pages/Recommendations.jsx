import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";
import "./Recommendations.css";

export default function Recommendations() {
  const { customer } = useCustomer();
  const [items, setItems] = useState([]);
  const [budget, setBudget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [acceptedIds, setAcceptedIds] = useState(new Set());

  useEffect(() => {
    let alive = true;
    api
      .getRecommendations(customer.id)
      .then((res) => {
        if (!alive) return;
        setItems(res.data || []);
        setBudget(res.budget || null);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load recommendations");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [customer.id]);

  async function handleAction(item, action) {
    setBusyId(item.id);
    setError("");
    try {
      await api.actOnRecommendation(customer.id, item.id, action);
      if (action === "dismissed") {
        setItems((prev) => prev.filter((row) => row.id !== item.id));
      } else {
        setAcceptedIds((prev) => new Set(prev).add(item.id));
      }
    } catch (err) {
      setError(err.message || "Could not save your response");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingBlock label="Finding what fits you…" />;

  return (
    <div className="rc">
      <div className="rc-hero" aria-hidden="true" />

      <div className="rc-shell">
        <header className="rc-header glass">
          <div>
            <p className="rc-kicker">For you</p>
            <h1>Recommendations</h1>
            <p>
              Rule-based picks scored from your pantry — saved to your profile,
              so they persist between visits.
            </p>
          </div>
          {budget && (
            <div className="rc-budget">
              <span>Left of your monthly budget</span>
              <strong className={budget.remaining < 0 ? "is-over" : ""}>
                {formatCurrency(budget.remaining)}
              </strong>
              <small>
                {formatCurrency(budget.monthSpend)} spent of{" "}
                {formatCurrency(budget.budgetMonthly)} — pricier picks are
                filtered out
              </small>
            </div>
          )}
        </header>

        {error && <div className="error-state glass rc-error">{error}</div>}

        <div className="rc-feed">
          {items.length === 0 ? (
            <div className="glass rc-empty">
              No recommendations right now — check back after your next shop.
            </div>
          ) : (
            items.map((item) => {
              const accepted = acceptedIds.has(item.id);
              return (
                <article
                  key={item.id}
                  className={`glass rc-card ${accepted ? "is-accepted" : ""}`}
                >
                  <div className="rc-card-main">
                    <div className="rc-card-tags">
                      <span className="rc-type">{item.type}</span>
                      {item.matchPercent != null && (
                        <span className="rc-match-pill">
                          {item.matchPercent}% pantry match
                        </span>
                      )}
                    </div>
                    <h2>
                      {item.recipe?.name || item.product?.name || "Suggestion"}
                    </h2>
                    <p className="rc-reason">{item.reason}</p>
                    <p className="rc-meta">
                      {item.recipe?.prep_time_minutes != null &&
                        `${item.recipe.prep_time_minutes} min · serves ${item.recipe.servings}`}
                      {item.estimatedMissingCost != null &&
                        ` · ~${formatCurrency(item.estimatedMissingCost)} to complete`}
                    </p>
                    {item.matchPercent != null && (
                      <div className="rc-bar">
                        <div style={{ width: `${item.matchPercent}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="rc-card-actions">
                    {item.recipe?.id && (
                      <Link
                        to={`/app/recipes/${item.recipe.id}`}
                        className="btn btn-sm btn-outline"
                      >
                        View recipe
                      </Link>
                    )}
                    {accepted ? (
                      <span className="rc-accepted-note">Added to your plans ✓</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={busyId === item.id}
                          onClick={() => handleAction(item, "accepted")}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          disabled={busyId === item.id}
                          onClick={() => handleAction(item, "dismissed")}
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
