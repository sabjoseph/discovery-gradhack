import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency, formatDate } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";
import "./Dashboard.css";

const AISLES = [
  {
    id: 1,
    to: "/app/pantry",
    title: "The Smart Pantry",
    blurb: "Manage your inventory and track stock levels in real time.",
    image:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: 2,
    to: "/app/recipes",
    title: "Recipe Kitchen",
    blurb: "Personalised meals ranked by what you already have on hand.",
    image:
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: 3,
    to: "/app/recipes#for-you",
    title: "Vitality Analytics",
    blurb: "Close your rings, benchmark peers, and simulate healthier swaps.",
    image:
      "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: 4,
    to: "/app/purchases",
    title: "Checkout & History",
    blurb: "Review past baskets and how your spend breaks down by health.",
    image:
      "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=800&q=80",
  },
];

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

  const maxTrend = useMemo(() => {
    if (!data?.spendTrend?.length) return 1;
    return Math.max(...data.spendTrend.map((d) => d.total), 1);
  }, [data]);

  if (loading) return <LoadingBlock label="Building your snapshot…" />;
  if (error) return <div className="error-state panel">{error}</div>;
  if (!data) return null;

  const { spend, pantry, topRecipes, recentBasket, budget, spendTrend } = data;
  const firstName = customer.name.split(" ")[0];

  return (
    <div className="dash">
      <div className="dash-hero" aria-hidden="true" />

      <div className="dash-layout">
        <div className="dash-main">
          <section className="dash-hello glass-dark">
            <div>
              <p className="dash-kicker">Dashboard</p>
              <h1>Hello, {firstName}</h1>
              <p>
                Ready for a vitality boost today? Your pantry is{" "}
                <strong>{pantry.stockedPct}% stocked</strong> with essentials
                from your recent HealthyFood shopping.
              </p>
            </div>
            <div className="dash-period">
              {[7, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={days === d ? "is-active" : ""}
                  onClick={() => setDays(d)}
                >
                  {d}d
                </button>
              ))}
            </div>
          </section>

          <section className="dash-aisles">
            {AISLES.map((aisle) => (
              <Link key={aisle.id} to={aisle.to} className="dash-aisle glass">
                <span className="dash-aisle-badge">Go</span>
                <div
                  className="dash-aisle-image"
                  style={{ backgroundImage: `url(${aisle.image})` }}
                />
                <div className="dash-aisle-body">
                  <h3>{aisle.title}</h3>
                  <p>{aisle.blurb}</p>
                  <span className="dash-aisle-link">
                    Open <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            ))}
          </section>

          <section className="dash-panels">
            <article className="glass dash-card">
              <header className="dash-card-head">
                <h2>Health mix</h2>
                <span>Last {days} days</span>
              </header>
              <div className="dash-mix-bar">
                <div style={{ width: `${spend.healthyPct}%` }} className="seg healthy" />
                <div style={{ width: `${spend.neutralPct}%` }} className="seg neutral" />
                <div style={{ width: `${spend.unhealthyPct}%` }} className="seg unhealthy" />
              </div>
              <div className="dash-mix-rows">
                <MixRow label="Healthy" amount={spend.healthy} pct={spend.healthyPct} tone="healthy" />
                <MixRow label="Neutral" amount={spend.neutral} pct={spend.neutralPct} tone="neutral" />
                <MixRow label="Unhealthy" amount={spend.unhealthy} pct={spend.unhealthyPct} tone="unhealthy" />
              </div>
              <p className="dash-footnote">
                Total spend {formatCurrency(spend.total)} · classified via
                HealthyFood categories
              </p>
            </article>

            <article className="glass dash-card">
              <header className="dash-card-head">
                <h2>Pantry glance</h2>
                <Link to="/app/pantry">View pantry →</Link>
              </header>
              <div className="dash-pantry-stat">
                <strong>{pantry.count}</strong>
                <span>items on hand</span>
              </div>
              {pantry.expiringItems.length === 0 ? (
                <p className="dash-empty">Nothing expiring in the next 3 days.</p>
              ) : (
                <ul className="dash-expiry-list">
                  {pantry.expiringItems.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.category}</small>
                      </div>
                      <span className="dash-expiry-pill">
                        {item.daysLeft === 0 ? "Today" : `${item.daysLeft}d left`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <section className="glass dash-card">
            <header className="dash-card-head">
              <h2>Recipes for you</h2>
              <Link to="/app/recipes">All recipes →</Link>
            </header>
            <div className="dash-recipes">
              {topRecipes.map((recipe) => (
                <Link
                  key={recipe.id}
                  to={`/app/recipes/${recipe.id}`}
                  className="dash-recipe"
                >
                  <div className="dash-recipe-top">
                    <h3>{recipe.name}</h3>
                    <span>{recipe.matchPercent}%</span>
                  </div>
                  <p>
                    {recipe.matchCount}/{recipe.totalIngredients} ingredients on
                    hand · {recipe.prepTimeMinutes} min
                  </p>
                  <div className="dash-recipe-bar">
                    <div style={{ width: `${recipe.matchPercent}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {budget && (
            <section className="glass dash-card dash-budget">
              <header className="dash-card-head">
                <h2>Budget & goals</h2>
                <Link to="/app/profile">Edit →</Link>
              </header>
              <div className="dash-budget-grid">
                <div>
                  <span className="dash-label">Monthly budget</span>
                  <strong>{formatCurrency(budget.budgetMonthly)}</strong>
                </div>
                <div>
                  <span className="dash-label">Spent this month</span>
                  <strong>{formatCurrency(budget.monthSpend)}</strong>
                </div>
                <div>
                  <span className="dash-label">Remaining</span>
                  <strong className={budget.remaining < 0 ? "is-over" : ""}>
                    {formatCurrency(budget.remaining)}
                  </strong>
                </div>
              </div>
              <div className="dash-budget-track">
                <div style={{ width: `${budget.usedPct}%` }} />
              </div>
              <p className="dash-footnote">{budget.usedPct}% of budget used</p>
              {(budget.dietaryPreferences.length > 0 ||
                budget.healthGoals.length > 0) && (
                <div className="dash-chips">
                  {[...budget.dietaryPreferences, ...budget.healthGoals].map(
                    (chip) => (
                      <span key={chip}>{chip}</span>
                    )
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="dash-side">
          <section className="glass dash-card">
            <header className="dash-card-head">
              <h2>Spend trends</h2>
              <span>{days}d</span>
            </header>
            <div className="dash-chart">
              {(spendTrend.length ? spendTrend.slice(-7) : []).map((point) => (
                <div key={point.date} className="dash-chart-col">
                  <div className="dash-chart-bar-wrap">
                    <div
                      className="dash-chart-bar"
                      style={{ height: `${Math.max(8, (point.total / maxTrend) * 100)}%` }}
                      title={formatCurrency(point.total)}
                    />
                  </div>
                  <span>{point.label}</span>
                </div>
              ))}
              {spendTrend.length === 0 && (
                <p className="dash-empty">No spend in this period.</p>
              )}
            </div>
            <div className="dash-weekly-total">
              <span>Period total</span>
              <strong>{formatCurrency(spend.total)}</strong>
            </div>
          </section>

          <section className="glass dash-card">
            <header className="dash-card-head">
              <h2>Your basket</h2>
              {recentBasket && (
                <span className="dash-count">{recentBasket.itemCount}</span>
              )}
            </header>
            {!recentBasket ? (
              <p className="dash-empty">No recent baskets in this window.</p>
            ) : (
              <>
                <p className="dash-basket-meta">
                  {recentBasket.retailer} · {formatDate(recentBasket.purchaseDate)}
                </p>
                <ul className="dash-basket-list">
                  {recentBasket.items.map((item) => (
                    <li key={item.id}>
                      <span className={`dash-dot ${item.healthTag}`} />
                      <div>
                        <strong>{item.name}</strong>
                        <small>
                          qty {item.quantity}
                          {item.category ? ` · ${item.category}` : ""}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
                <Link to="/app/purchases" className="dash-checkout">
                  Go to history
                </Link>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function MixRow({ label, amount, pct, tone }) {
  return (
    <div className="dash-mix-row">
      <div>
        <span className={`tag tag-${tone}`}>{label}</span>
        <span className="dash-mix-pct">{pct}%</span>
      </div>
      <strong>{formatCurrency(amount)}</strong>
    </div>
  );
}
