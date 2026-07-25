import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";
import ProgressRing from "../components/ProgressRing";
import "./Analytics.css";

function scoreStatus(value, goal) {
  if (value >= 80) return "Top form";
  if (value >= goal) return "Healthy month unlocked";
  if (value >= 40) return "Building momentum";
  return "Getting started";
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="an-tooltip">
      <strong>{label}</strong>
      {payload.map((p) => (
        <div key={p.dataKey}>
          {p.name}: {typeof p.value === "number" ? p.value : p.value}
          {p.unit || ""}
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const { customer } = useCustomer();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api
      .getAnalytics(customer.id, days)
      .then((res) => {
        if (alive) setData(res.data);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load analytics");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [customer.id, days]);

  const categoryChartData = useMemo(() => {
    if (!data?.categories) return [];
    return data.categories.map((c) => ({
      name: c.subcategory.length > 18 ? `${c.subcategory.slice(0, 16)}…` : c.subcategory,
      fullName: c.subcategory,
      spend: Math.round(c.spend),
      signed: c.signedSpend,
      tag: c.tag,
      pct: c.pct,
    }));
  }, [data]);

  if (loading) return <LoadingBlock label="Building your Vitality analytics…" />;
  if (error) {
    return (
      <div className="an">
        <div className="glass an-error">{error}</div>
      </div>
    );
  }
  if (!data) return null;

  const { score, rings, trend, swaps, projectedScore, peers } = data;
  const delta = score.delta;
  const budgetRing = rings.budget;
  const budgetMax = 100;
  const budgetValue = Math.min(budgetMax, budgetRing.usedPct);
  const budgetColor = budgetRing.over ? "#d64545" : "#001b44";

  return (
    <div className="an">
      <header className="page-header an-header">
        <div>
          <p className="an-kicker">Vitality Analytics</p>
          <h1>Your healthy shopping score</h1>
          <p>
            Close your rings, see where spend goes, and simulate smarter swaps —
            built from your real HealthyFood baskets.
          </p>
        </div>
        <div className="an-period">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              type="button"
              className={days === d ? "active" : undefined}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </header>

      {/* Hero: score + triple rings */}
      <section className="an-hero glass">
        <div className="an-score-block">
          <ProgressRing
            value={score.value}
            max={100}
            size={176}
            stroke={14}
            color="#7bbc43"
            goal={score.goal}
          >
            <strong className="an-score-num">{score.value}</strong>
            <span className="an-score-label">BiteBetter</span>
          </ProgressRing>
          <div className="an-score-meta">
            <span className={`an-delta ${delta >= 0 ? "up" : "down"}`}>
              {score.previous > 0 ? (
                <>
                  {delta >= 0 ? "+" : ""}
                  {delta} vs prior {days}d
                </>
              ) : (
                <>Goal {score.goal} to unlock Healthy month</>
              )}
            </span>
            <p className="an-status">{scoreStatus(score.value, score.goal)}</p>
            <p className="an-mix-line">
              {score.healthyPct}% healthy · {score.neutralPct}% neutral ·{" "}
              {score.unhealthyPct}% unhealthy
            </p>
            {score.value >= score.goal && (
              <span className="an-badge">+{rings.healthy.points} pts unlocked</span>
            )}
          </div>
        </div>

        <div className="an-triple">
          <div className="an-goal-ring">
            <ProgressRing
              value={rings.healthy.current}
              max={rings.healthy.target}
              size={112}
              stroke={10}
              color="#7bbc43"
            >
              <strong>{rings.healthy.current}%</strong>
              <span>of {rings.healthy.target}%</span>
            </ProgressRing>
            <h3>Healthy</h3>
            <p>{rings.healthy.closed ? "Ring closed" : "Keep closing"}</p>
          </div>

          <div className="an-goal-ring">
            <ProgressRing
              value={budgetValue}
              max={budgetMax}
              size={112}
              stroke={10}
              color={budgetColor}
            >
              <strong>{budgetRing.usedPct}%</strong>
              <span>used</span>
            </ProgressRing>
            <h3>{budgetRing.label}</h3>
            <p>
              {budgetRing.inferred
                ? `${formatCurrency(budgetRing.monthSpend)} this month`
                : budgetRing.over
                  ? `${formatCurrency(Math.abs(budgetRing.remaining))} over`
                  : `${formatCurrency(budgetRing.remaining)} left`}
            </p>
          </div>

          <div className="an-goal-ring">
            <ProgressRing
              value={rings.pantry.freshPct}
              max={rings.pantry.target}
              size={112}
              stroke={10}
              color="#d4a017"
            >
              <strong>{rings.pantry.freshPct}%</strong>
              <span>fresh</span>
            </ProgressRing>
            <h3>{rings.pantry.label}</h3>
            <p>
              {rings.pantry.itemCount === 0
                ? "No items stocked"
                : rings.pantry.expiringSoon === 0
                  ? `All ${rings.pantry.itemCount} items fresh`
                  : `${rings.pantry.expiringSoon} of ${rings.pantry.itemCount} expiring soon`}
            </p>
          </div>
        </div>
      </section>

      {/* Trend */}
      <section className="glass an-card">
        <div className="an-card-head">
          <div>
            <h2>Score over time</h2>
            <p>Weekly BiteBetter score across your shopping history.</p>
          </div>
        </div>
        <div className="an-chart">
          {trend.length === 0 ? (
            <p className="an-empty">Not enough baskets in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fill: "#5b6b7c", fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#5b6b7c", fontSize: 12 }} width={36} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={score.goal} stroke="#7bbc43" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="Score"
                  stroke="#001b44"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#7bbc43" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <div className="an-grid">
        {/* Categories */}
        <section className="glass an-card">
          <div className="an-card-head">
            <div>
              <h2>Where the money goes</h2>
              <p>Top categories by spend — green healthy, red unhealthy.</p>
            </div>
          </div>
          <div className="an-chart an-chart-tall">
            {categoryChartData.length === 0 ? (
              <p className="an-empty">No category spend yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={categoryChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#5b6b7c", fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={108}
                    tick={{ fill: "#001b44", fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value, _n, props) => [
                      `${formatCurrency(Math.abs(value))} (${props.payload.pct}%)`,
                      props.payload.fullName,
                    ]}
                  />
                  <Bar dataKey="spend" radius={[0, 6, 6, 0]} name="Spend">
                    {categoryChartData.map((entry) => (
                      <Cell
                        key={entry.fullName}
                        fill={
                          entry.tag === "unhealthy"
                            ? "#d64545"
                            : entry.tag === "healthy"
                              ? "#7bbc43"
                              : "#94a3b8"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Peers */}
        <section className="glass an-card">
          <div className="an-card-head an-card-head-row">
            <div>
              <h2>Peer benchmark</h2>
              <p>
                Healthy-spend % vs {peers.customerCount} HealthyFood shoppers.
              </p>
            </div>
            <ProgressRing
              value={peers.percentile}
              max={100}
              size={88}
              stroke={8}
              color="#001b44"
            >
              <strong className="an-pct-num">{peers.percentile}</strong>
              <span className="an-pct-suffix">th</span>
            </ProgressRing>
          </div>
          <div className="an-chart">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={peers.distribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fill: "#5b6b7c", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "#5b6b7c", fontSize: 11 }} width={28} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Shoppers" radius={[6, 6, 0, 0]}>
                  {peers.distribution.map((entry) => (
                    <Cell
                      key={entry.label}
                      fill={entry.isYours ? "#7bbc43" : "#001b44"}
                      fillOpacity={entry.isYours ? 1 : 0.35}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="an-peer-caption">
              You&apos;re at <strong>{peers.yourHealthyPct}%</strong> healthy spend —{" "}
              <strong>{peers.percentile}th</strong> percentile. Green bar = your band.
            </p>
          </div>
        </section>
      </div>

      {/* Swaps */}
      <section className="glass an-card an-swaps">
        <div className="an-card-head">
          <div>
            <h2>Swap simulator</h2>
            <p>
              Replace your top unhealthy spends and watch the Healthy ring close.
            </p>
          </div>
        </div>

        <div className="an-swap-rings">
          <div className="an-swap-ring">
            <ProgressRing value={score.value} max={100} size={120} stroke={11} color="#94a3b8">
              <strong>{score.value}</strong>
              <span>Now</span>
            </ProgressRing>
          </div>
          <div className="an-swap-arrow" aria-hidden>
            →
          </div>
          <div className="an-swap-ring">
            <ProgressRing
              value={projectedScore}
              max={100}
              size={120}
              stroke={11}
              color="#7bbc43"
              goal={score.goal}
            >
              <strong>{projectedScore}</strong>
              <span>If you swap</span>
            </ProgressRing>
          </div>
          <div className="an-swap-gain">
            <strong>+{Math.max(0, projectedScore - score.value)}</strong>
            <span>projected score points</span>
            {projectedScore >= score.goal && score.value < score.goal && (
              <span className="an-badge">Would unlock Healthy month</span>
            )}
          </div>
        </div>

        {swaps.length === 0 ? (
          <p className="an-empty">No unhealthy items to swap in this period — nice work.</p>
        ) : (
          <ul className="an-swap-list">
            {swaps.map((s) => (
              <li key={`${s.fromName}-${s.fromCategory}`}>
                <div className="an-swap-from">
                  <strong>{s.fromName}</strong>
                  <span>
                    {s.fromCategory} · {formatCurrency(s.fromSpend)}
                  </span>
                </div>
                <div className="an-swap-to">
                  <strong>→ {s.toName}</strong>
                  <span>
                    ~{formatCurrency(s.estPrice)}
                    {s.randDelta !== 0 && (
                      <>
                        {" "}
                        ({s.randDelta > 0 ? "+" : ""}
                        {formatCurrency(s.randDelta)})
                      </>
                    )}
                  </span>
                  <em>{s.reason}</em>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
