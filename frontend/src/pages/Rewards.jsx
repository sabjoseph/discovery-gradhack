import { useEffect, useState } from "react";
import { useCustomer } from "../context/CustomerContext";
import { api, formatDate } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";
import "./Rewards.css";

const EXAMPLE_REWARDS = [
  {
    name: "Fresh fruit voucher",
    detail: "R50 off seasonal fruit at Checkers or Woolworths",
    points: 50,
  },
  {
    name: "Veggie box top-up",
    detail: "R75 credit toward a weekly vegetable box",
    points: 80,
  },
  {
    name: "Vitality meal kit",
    detail: "One Discovery Vitality healthy meal kit delivery",
    points: 120,
  },
  {
    name: "Free-range protein pack",
    detail: "R100 off chicken, ostrich, or plant-based protein",
    points: 150,
  },
  {
    name: "Pantry essentials bundle",
    detail: "Olive oil, legumes, and whole grains starter pack",
    points: 200,
  },
  {
    name: "Family healthy shop",
    detail: "R250 grocery voucher for healthy basket items",
    points: 300,
  },
];

function statusLabel(status) {
  if (status === "pending") return "Reward pending";
  if (status === "issued") return "Issued";
  if (status === "redeemed") return "Redeemed";
  if (status === "in_progress") return "In progress";
  return status;
}

function MilestoneCard({ milestone }) {
  const done = milestone.achieved;
  return (
    <article className={`glass rw-card ${done ? "is-done" : ""}`}>
      <div className="rw-card-top">
        <div>
          <div className="rw-card-tags">
            <span className={`rw-status ${done ? "done" : "active"}`}>
              {done ? "Achieved" : "Active"}
            </span>
            {done && (
              <span className="rw-reward-status">
                {statusLabel(milestone.rewardStatus)}
              </span>
            )}
          </div>
          <h2>{milestone.name}</h2>
          <p>{milestone.description}</p>
        </div>
        <div className="rw-points">
          <strong>+{milestone.rewardValue}</strong>
          <span>pts</span>
        </div>
      </div>

      <div className="rw-progress">
        <div className="rw-bar">
          <div style={{ width: `${milestone.percent}%` }} />
        </div>
        <div className="rw-progress-meta">
          <span>
            {milestone.currentRaw ?? milestone.current} / {milestone.target}
          </span>
          <span>{milestone.percent}%</span>
        </div>
      </div>

      {done && milestone.achievedAt && (
        <p className="rw-achieved-at">
          Unlocked {formatDate(milestone.achievedAt)}
        </p>
      )}
    </article>
  );
}

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

  const inProgress = data?.inProgress || [];
  const completed = data?.completed || [];
  const allMilestones = data?.milestones || [];
  const stats = data?.stats || {};
  const pendingRewards = completed.filter(
    (m) => m.rewardStatus === "pending"
  ).length;
  const pointsEarned = completed.reduce(
    (sum, m) => sum + Number(m.rewardValue || 0),
    0
  );
  const pointsAvailable = allMilestones.reduce(
    (sum, m) => sum + Number(m.rewardValue || 0),
    0
  );

  return (
    <div className="rw">
      <div className="rw-hero" aria-hidden="true" />

      <div className="rw-shell">
        <header className="rw-header glass">
          <div>
            <p className="rw-kicker">Rewards</p>
            <h1>Milestones</h1>
            <p>
              Habit goals tracked from your shopping, pantry, and activity —
              unlock points as you cross each threshold.
            </p>
          </div>
          <div className="rw-header-stats">
            <div>
              <span>Points earned</span>
              <strong>{pointsEarned}</strong>
            </div>
            <div>
              <span>Achieved</span>
              <strong>{completed.length}</strong>
            </div>
            <div>
              <span>Pending rewards</span>
              <strong>{pendingRewards}</strong>
            </div>
          </div>
        </header>

        {error && <div className="error-state glass rw-error">{error}</div>}

        <section className="glass rw-catalogue">
          <div className="rw-section-head">
            <h2>What you can redeem</h2>
            <p>
              Example rewards for the points you earn from milestones. You have{" "}
              <strong>{pointsEarned} pts</strong> so far
              {pointsAvailable > 0 ? ` of ${pointsAvailable} pts available` : ""}.
            </p>
          </div>
          <div className="rw-reward-grid">
            {EXAMPLE_REWARDS.map((reward) => {
              const canAfford = pointsEarned >= reward.points;
              return (
                <article
                  key={reward.name}
                  className={`rw-reward-item ${canAfford ? "is-affordable" : ""}`}
                >
                  <div>
                    <h3>{reward.name}</h3>
                    <p>{reward.detail}</p>
                  </div>
                  <div className="rw-reward-cost">
                    <strong>{reward.points}</strong>
                    <span>pts</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="glass rw-earn">
          <div className="rw-section-head">
            <h2>How you earn points</h2>
            <p>Each milestone pays out when you hit its target.</p>
          </div>
          <div className="rw-earn-list">
            {allMilestones.map((m) => (
              <div key={m.id} className="rw-earn-row">
                <span>{m.name}</span>
                <strong>+{m.rewardValue} pts</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rw-glance">
          <h2>This month at a glance</h2>
          <div className="rw-glance-grid">
            <div>
              <span>Healthy baskets</span>
              <strong>{stats.healthyBaskets ?? 0}</strong>
            </div>
            <div>
              <span>Recipes tried</span>
              <strong>{stats.recipesTried ?? 0}</strong>
            </div>
            <div>
              <span>Login streak</span>
              <strong>{stats.loginStreak ?? 0}d</strong>
            </div>
            <div>
              <span>Healthy spend</span>
              <strong>{stats.healthySpendPct ?? 0}%</strong>
            </div>
            <div>
              <span>Pantry items</span>
              <strong>{stats.pantryItems ?? 0}</strong>
            </div>
          </div>
        </section>

        <section className="rw-section">
          <div className="rw-section-head">
            <h2>In progress</h2>
            <p>Keep going — progress updates from your real baskets and activity.</p>
          </div>
          {inProgress.length === 0 ? (
            <div className="glass rw-empty">
              All current milestones unlocked — nice work.
            </div>
          ) : (
            <div className="rw-list">
              {inProgress.map((m) => (
                <MilestoneCard key={m.id} milestone={m} />
              ))}
            </div>
          )}
        </section>

        <section className="rw-section">
          <div className="rw-section-head">
            <h2>Achieved</h2>
            <p>Rewards land as pending until they&apos;re issued or redeemed.</p>
          </div>
          {completed.length === 0 ? (
            <div className="glass rw-empty">
              No milestones unlocked yet — your progress bars above will fill as you shop.
            </div>
          ) : (
            <div className="rw-list">
              {completed.map((m) => (
                <MilestoneCard key={m.id} milestone={m} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
