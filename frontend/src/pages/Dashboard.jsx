import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";
import { LEAF_SRC, openLeafyChat } from "../components/FloatingCharacter";
import "../components/FloatingCharacter.css";
import "./Dashboard.css";

const PROFILE_GOALS = "/app/profile?tab=account&panel=preferences";
const PERIODS = [7, 30];

function periodFromSearch(searchParams) {
  const raw = Number(searchParams.get("days"));
  return PERIODS.includes(raw) ? raw : 30;
}

function formatGoalList(goals) {
  if (!goals?.length) return "";
  if (goals.length === 1) return goals[0];
  if (goals.length === 2) return `${goals[0]} and ${goals[1]}`;
  return `${goals.slice(0, -1).join(", ")}, and ${goals[goals.length - 1]}`;
}

function buildWins({ spend, pantry, budget, days }) {
  const wins = [];

  wins.push({
    id: "healthy",
    label: "Healthy shopping",
    value: spend.total > 0 ? `${spend.healthyPct}%` : "—",
    detail:
      spend.total > 0
        ? `${formatCurrency(spend.healthy)} of ${formatCurrency(spend.total)} in the last ${days} days`
        : `No shops in the last ${days} days yet`,
  });

  if (pantry.count > 0) {
    wins.push({
      id: "pantry",
      label: "Pantry ready",
      value: `${pantry.count}`,
      detail: "items on hand right now",
    });
  }

  if (budget && budget.remaining >= 0) {
    wins.push({
      id: "budget",
      label: "On budget",
      value: formatCurrency(budget.remaining),
      detail: budget.monthLabel
        ? `still left · ${budget.monthLabel}`
        : "still left this month",
    });
  }

  return wins.slice(0, 4);
}

export default function Dashboard() {
  const { customer } = useCustomer();
  const [searchParams, setSearchParams] = useSearchParams();
  const days = periodFromSearch(searchParams);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const firstLoad = data == null;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);
    setError("");

    Promise.all([
      api.getDashboard(customer.id, days),
      api.getProfile(customer.id).catch(() => null),
    ])
      .then(([dashboardRes, profileRes]) => {
        if (!alive) return;
        const profileGoals = profileRes?.data?.profile?.health_goals;
        setData({
          ...dashboardRes.data,
          healthGoals: Array.isArray(profileGoals)
            ? profileGoals.filter((goal) => typeof goal === "string")
            : dashboardRes.data.healthGoals || [],
        });
      })
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load dashboard");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      alive = false;
    };
    // Re-fetch when period changes — data intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id, days]);

  function changePeriod(nextDays) {
    if (nextDays === days) return;
    const next = new URLSearchParams(searchParams);
    if (nextDays === 30) next.delete("days");
    else next.set("days", String(nextDays));
    setSearchParams(next, { replace: true });
  }

  if (loading) return <LoadingBlock label="Building your snapshot…" />;
  if (error && !data) return <div className="error-state panel">{error}</div>;
  if (!data) return null;

  const { spend, pantry, budget, healthGoals = [] } = data;
  const firstName = customer.name.split(" ")[0];
  const goals = healthGoals.length ? healthGoals : budget?.healthGoals || [];
  const wins = buildWins({ spend, pantry, budget, days });
  const expiredCount = Number(pantry.expiredCount || 0);
  const soonCount = Number(pantry.expiringSoon || 0);
  const freshCount = Number(
    pantry.freshCount ??
      Math.max(0, (pantry.count || 0) - expiredCount - soonCount)
  );

  return (
    <div className={`dash ${refreshing ? "is-refreshing" : ""}`}>
      <div className="dash-hero" aria-hidden="true" />

      <div className="dash-layout dash-layout-single">
        <div className="dash-main">
          <section className="bb-home-welcome" aria-label="Meet Leafy">
            <button
              type="button"
              className="bb-home-welcome-trigger"
              onClick={openLeafyChat}
              aria-label="Open chat with Leafy"
            >
              <div className="bb-char bb-char-home" aria-hidden="true">
                <img src={LEAF_SRC} alt="" />
              </div>
            </button>
            <div className="bb-home-welcome-copy">
              <strong>Hi, I&apos;m Leafy — your BiteBetter pantry pal!</strong>
              <p>
                I&apos;m here to help you use what you&apos;ve already got, find
                recipes, and eat a little healthier. Tap me anytime you want to
                chat 🍃
              </p>
            </div>
          </section>

          <section className="dash-hello glass-dark">
            <div>
              <p className="dash-kicker">Dashboard</p>
              <h1>
                Hi, {firstName}{" "}
                <span className="dash-wave" aria-hidden="true">
                  👋
                </span>
              </h1>
              {goals.length > 0 ? (
                <p className="dash-hello-goal">
                  Your goal is <strong>{formatGoalList(goals)}</strong>
                </p>
              ) : (
                <p className="dash-hello-goal">
                  Your goal is not set yet —{" "}
                  <Link to={PROFILE_GOALS}>set one on your profile</Link>
                </p>
              )}
              <p>Let’s see how you’re doing.</p>
            </div>
            <div className="dash-period" role="group" aria-label="Time period">
              {PERIODS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={days === d ? "is-active" : undefined}
                  aria-pressed={days === d}
                  onClick={() => changePeriod(d)}
                >
                  {d}d
                </button>
              ))}
            </div>
          </section>

          {error ? <div className="error-state panel">{error}</div> : null}

          <div className="dash-wins-row">
            <section className="glass dash-card dash-wins" key={`wins-${days}`}>
              <header className="dash-card-head">
                <h2>Wins so far</h2>
                <span>Last {days} days</span>
              </header>
              <div className="dash-wins-grid">
                {wins.map((win) => (
                  <article key={win.id} className="dash-win">
                    <span className="dash-win-label">{win.label}</span>
                    <strong>{win.value}</strong>
                    <p>{win.detail}</p>
                  </article>
                ))}
              </div>
            </section>

            <div className="dash-status-stack">
              <Link
                to="/app/pantry?focus=expired"
                className="dash-status-card is-expired"
                title="View expired foods in pantry"
              >
                <span className="dash-status-label">Expired</span>
                <strong className="dash-status-count">{expiredCount}</strong>
              </Link>
              <Link
                to="/app/pantry?focus=soon"
                className="dash-status-card is-soon"
                title="View foods expiring within 60 days"
              >
                <span className="dash-status-label">Expiring</span>
                <strong className="dash-status-count">{soonCount}</strong>
              </Link>
              <Link
                to="/app/pantry?focus=fresh"
                className="dash-status-card is-fresh"
                title="View remaining pantry items"
              >
                <span className="dash-status-label">Fresh</span>
                <strong className="dash-status-count">{freshCount}</strong>
              </Link>
            </div>
          </div>

          <section className="dash-panels">
            <article
              className="glass dash-card dash-spend-compact"
              key={`spend-${days}`}
            >
              <header className="dash-card-head">
                <h2>Healthy spend</h2>
                <span>Last {days} days</span>
              </header>
              <div className="dash-spend-compact-body">
                <strong className="dash-spend-pct">{spend.healthyPct}%</strong>
                <div className="dash-mix-bar">
                  <div
                    style={{ width: `${spend.healthyPct}%` }}
                    className="seg healthy"
                  />
                  <div
                    style={{ width: `${spend.neutralPct}%` }}
                    className="seg neutral"
                  />
                  <div
                    style={{ width: `${spend.unhealthyPct}%` }}
                    className="seg unhealthy"
                  />
                </div>
                <ul className="dash-spend-key" aria-label="Spend key">
                  <li>
                    <span className="dash-key-swatch healthy" aria-hidden="true" />
                    Healthy {spend.healthyPct}%
                  </li>
                  <li>
                    <span className="dash-key-swatch neutral" aria-hidden="true" />
                    Neutral {spend.neutralPct}%
                  </li>
                  <li>
                    <span className="dash-key-swatch unhealthy" aria-hidden="true" />
                    Less healthy {spend.unhealthyPct}%
                  </li>
                </ul>
                <p className="dash-footnote">
                  {formatCurrency(spend.healthy)} of{" "}
                  {formatCurrency(spend.total)} was healthy
                </p>
              </div>
            </article>
          </section>
        </div>
      </div>
    </div>
  );
}

