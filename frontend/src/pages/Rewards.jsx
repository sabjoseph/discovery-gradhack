import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency, formatDate } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";
import "./Rewards.css";

const PROFILE_REWARDS = "/app/profile?tab=rewards";

function MilestoneCard({ milestone }) {
  const done = milestone.achieved;
  const cookeryUnlock = milestone.rewardLabel === "Cookery unlock";
  const progressText =
    milestone.criteriaKey === "healthy_foods"
      ? `${milestone.currentRaw ?? milestone.current}/${milestone.target} healthy foods`
      : `${milestone.currentRaw ?? milestone.current} / ${milestone.target}`;
  return (
    <article className={`glass rw-card ${done ? "is-done" : ""}`}>
      <div className="rw-card-top">
        <div>
          <div className="rw-card-tags">
            <span className={`rw-status ${done ? "done" : "active"}`}>
              {done ? "Achieved" : "Active"}
            </span>
          </div>
          <h2>{milestone.name}</h2>
          <p>{milestone.description}</p>
        </div>
        <div className="rw-points">
          {cookeryUnlock ? (
            <>
              <strong className="rw-free-label">Unlock</strong>
              <span>voucher</span>
            </>
          ) : (
            <>
              <strong>+{milestone.rewardValue}</strong>
              <span>pts</span>
            </>
          )}
        </div>
      </div>

      <div className="rw-progress">
        <div className="rw-bar">
          <div style={{ width: `${milestone.percent}%` }} />
        </div>
        <div className="rw-progress-meta">
          <span>{progressText}</span>
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
  const [rewards, setRewards] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redeemHelpOpen, setRedeemHelpOpen] = useState(false);
  const [redeemingId, setRedeemingId] = useState(null);
  const [redeemError, setRedeemError] = useState("");
  const [issuedVoucher, setIssuedVoucher] = useState(null);

  const load = useCallback(async () => {
    // Milestones first so newly earned points (e.g. 3 recipes) are written
    // before the rewards balance is calculated.
    const milestonesRes = await api.getMilestones(customer.id);
    const rewardsRes = await api.getRewards(customer.id);
    setData(milestonesRes.data);
    setRewards(rewardsRes.data);
    if (rewardsRes.data?.issuedVoucher) {
      setIssuedVoucher(rewardsRes.data.issuedVoucher);
    }
  }, [customer.id]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load rewards");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  async function onRedeem(rewardId) {
    setRedeemError("");
    setRedeemingId(rewardId);
    try {
      const res = await api.redeemReward(customer.id, rewardId);
      setRewards((prev) => ({
        ...prev,
        catalog: res.data.catalog || prev?.catalog || [],
        pointsEarned: res.data.pointsEarned,
        pointsSpent: res.data.pointsSpent,
        pointsBalance: res.data.pointsBalance,
        vouchers: res.data.vouchers,
        healthyFoods: res.data.healthyFoods ?? prev?.healthyFoods,
        cookeryUnlocked: res.data.cookeryUnlocked ?? prev?.cookeryUnlocked,
      }));
      setIssuedVoucher(res.data.voucher);
      // Refresh milestones so The Cookery moves to Achieved.
      const milestonesRes = await api.getMilestones(customer.id);
      setData(milestonesRes.data);
    } catch (err) {
      setRedeemError(
        err.response?.data?.message || err.message || "Redeem failed"
      );
    } finally {
      setRedeemingId(null);
    }
  }

  if (loading) return <LoadingBlock label="Checking your milestones…" />;

  const inProgress = data?.inProgress || [];
  const completed = data?.completed || [];
  const allMilestones = data?.milestones || [];
  const stats = data?.stats || {};
  const pendingRewards = completed.filter(
    (m) => m.rewardStatus === "pending"
  ).length;
  const pointsEarned =
    rewards?.pointsEarned ??
    completed.reduce((sum, m) => sum + Number(m.rewardValue || 0), 0);
  const pointsBalance = rewards?.pointsBalance ?? pointsEarned;
  const pointsSpent = rewards?.pointsSpent ?? 0;
  const catalog = rewards?.catalog || [];
  const sortedCatalog = catalog
    .map((reward, index) => ({ reward, index }))
    .sort((a, b) => {
      const rank = (reward) => {
        // Claimed vouchers always sink to the bottom.
        if (reward.alreadyOwned) return 4;
        // The Cookery stays pinned among unclaimed rewards.
        if (reward.unlockCriteria === "healthy_foods") return 0;
        if (reward.canAfford) return 1;
        if (!reward.locked) return 2;
        return 3;
      };
      return (
        rank(a.reward) - rank(b.reward) ||
        Number(a.reward.points) - Number(b.reward.points) ||
        a.index - b.index
      );
    })
    .map(({ reward }) => reward);
  const vouchers = rewards?.vouchers || [];
  const pointsAvailable = allMilestones
    .filter((m) => Number(m.rewardValue || 0) > 0)
    .reduce((sum, m) => sum + Number(m.rewardValue || 0), 0);
  const earnMilestones = allMilestones.filter(
    (m) => Number(m.rewardValue || 0) > 0
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
              Hit habit goals as you shop and cook — unlock points, then redeem
              them for vouchers.
            </p>
          </div>
          <div className="rw-header-stats">
            <div>
              <span>Points balance</span>
              <strong>{pointsBalance}</strong>
            </div>
            <div>
              <span>Earned</span>
              <strong>{pointsEarned}</strong>
            </div>
            <div>
              <span>Achieved</span>
              <strong>{completed.length}</strong>
            </div>
            <Link
              to={PROFILE_REWARDS}
              className="rw-stat-link"
              title="View vouchers on your profile"
            >
              <span>Pending rewards</span>
              <strong>{pendingRewards}</strong>
            </Link>
          </div>
        </header>

        {error && <div className="error-state glass rw-error">{error}</div>}
        {redeemError && (
          <div className="error-state glass rw-error">{redeemError}</div>
        )}

        <div className="rw-top-row">
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
                <span>Healthy foods</span>
                <strong>
                  {rewards?.healthyFoods ?? stats.healthyFoods ?? 0}
                </strong>
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

          <section className="glass rw-vouchers-panel">
            <div className="rw-section-head">
              <h2>
                <Link to={PROFILE_REWARDS} className="rw-inline-link">
                  Your vouchers
                </Link>
              </h2>
              <p>
                {vouchers.length
                  ? `${vouchers.length} ready to use`
                  : "Claim rewards to collect voucher codes here"}
              </p>
            </div>
            {vouchers.length === 0 ? (
              <div className="rw-vouchers-empty">
                <p>
                  No vouchers yet — redeem points or buy 10 healthy foods for The
                  Cookery voucher.
                </p>
                <Link to={PROFILE_REWARDS} className="rw-help-link">
                  Open profile rewards →
                </Link>
              </div>
            ) : (
              <div className="rw-vouchers-list">
                {vouchers.map((v) => (
                  <article key={v.id} className="rw-voucher-chip">
                    <div>
                      <strong>{v.name}</strong>
                      <code>{v.code}</code>
                    </div>
                    <span>{formatCurrency(v.valueZar)}</span>
                  </article>
                ))}
                <Link to={PROFILE_REWARDS} className="rw-help-link">
                  View all on profile →
                </Link>
              </div>
            )}
          </section>
        </div>

        <div className="rw-body">
          <div className="rw-main">
            <section className="rw-section">
              <div className="rw-section-head">
                <h2>In progress</h2>
                <p>
                  Keep going — your progress updates as you shop and cook.
                </p>
              </div>
              {inProgress.length === 0 ? (
                <div className="glass rw-empty">
                  All current milestones unlocked — nice work.
                </div>
              ) : (
                <div className="rw-grid-scroll">
                  <div className="rw-card-grid">
                    {inProgress.map((m) => (
                      <MilestoneCard key={m.id} milestone={m} />
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="rw-section">
              <div className="rw-section-head">
                <h2>Achieved</h2>
                <p>
                  Points from these goals are ready to spend — redeem them for
                  vouchers on the right.
                </p>
              </div>
              {completed.length === 0 ? (
                <div className="glass rw-empty">
                  No milestones unlocked yet — your progress bars above will
                  fill as you shop.
                </div>
              ) : (
                <div className="rw-grid-scroll">
                  <div className="rw-card-grid">
                    {completed.map((m) => (
                      <MilestoneCard key={m.id} milestone={m} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="glass rw-side">
            <div className="rw-section-head">
              <h2>What you can redeem</h2>
              <p>
                Balance <strong>{pointsBalance}</strong>
                {pointsSpent > 0 ? ` · ${pointsSpent} spent` : ""}
                {pointsAvailable > 0 ? ` · ${pointsAvailable} available from goals` : ""}
              </p>
              <button
                type="button"
                className="rw-help-link"
                onClick={() => setRedeemHelpOpen(true)}
              >
                How to earn points
              </button>
            </div>

            <div className="rw-side-scroll">
              <div className="rw-reward-stack">
                {sortedCatalog.map((reward) => {
                  const canAfford = Boolean(reward.canAfford);
                  const busy = redeemingId === reward.id;
                  const locked = Boolean(reward.locked);
                  const owned = Boolean(reward.alreadyOwned);
                  const isCookery = reward.unlockCriteria === "healthy_foods";
                  const healthyFoods = Math.min(
                    10,
                    Number(
                      reward.progress?.current ??
                        rewards?.healthyFoods ??
                        stats.healthyFoods ??
                        0
                    )
                  );
                  let buttonLabel = `Need ${reward.points} pts`;
                  if (owned) buttonLabel = "Already claimed";
                  else if (busy) buttonLabel = "Claiming…";
                  else if (isCookery && locked)
                    buttonLabel = `${healthyFoods}/10 healthy foods`;
                  else if (canAfford) buttonLabel = "Claim voucher";
                  else if (isCookery)
                    buttonLabel = `${healthyFoods}/10 healthy foods`;

                  return (
                    <article
                      key={reward.id}
                      className={`rw-reward-item ${canAfford ? "is-affordable" : ""} ${locked ? "is-locked" : ""} ${owned ? "is-owned" : ""}`}
                    >
                      <div className="rw-reward-copy">
                        <h3>
                          {owned ? (
                            <Link to={PROFILE_REWARDS} className="rw-inline-link">
                              {reward.name}
                            </Link>
                          ) : (
                            reward.name
                          )}
                        </h3>
                        <p>{reward.detail}</p>
                        {owned ? (
                          <Link
                            to={PROFILE_REWARDS}
                            className="btn btn-sm btn-outline rw-redeem-btn"
                          >
                            View on profile
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary rw-redeem-btn"
                            disabled={!canAfford || Boolean(redeemingId)}
                            onClick={() => onRedeem(reward.id)}
                          >
                            {buttonLabel}
                          </button>
                        )}
                      </div>
                      {reward.points > 0 && (
                        <div className="rw-reward-cost">
                          <strong>{reward.points}</strong>
                          <span>pts</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {redeemHelpOpen && (
        <div
          className="rw-modal-backdrop"
          role="presentation"
          onClick={() => setRedeemHelpOpen(false)}
        >
          <div
            className="glass rw-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rw-redeem-help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rw-modal-head">
              <h2 id="rw-redeem-help-title">How to earn points</h2>
              <button
                type="button"
                className="rw-modal-close"
                onClick={() => setRedeemHelpOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="rw-modal-lead">
              Hit these milestones to add points to your balance. Then spend them
              on vouchers in the redeem list.
            </p>
            <h3>Ways to earn</h3>
            <div className="rw-earn-list">
              {earnMilestones.map((m) => (
                <div key={m.id} className="rw-earn-row">
                  <span>{m.description || m.name}</span>
                  <strong>+{m.rewardValue} pts</strong>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary rw-modal-done"
              onClick={() => setRedeemHelpOpen(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {issuedVoucher && (
        <div
          className="rw-modal-backdrop"
          role="presentation"
          onClick={() => setIssuedVoucher(null)}
        >
          <div
            className="glass rw-modal rw-modal-success"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rw-voucher-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rw-modal-head">
              <h2 id="rw-voucher-title">Voucher unlocked</h2>
              <button
                type="button"
                className="rw-modal-close"
                onClick={() => setIssuedVoucher(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="rw-modal-lead">
              {issuedVoucher.name} is yours. Show this code at checkout.
            </p>
            <div className="rw-voucher-code">
              <span>Code</span>
              <strong>{issuedVoucher.code}</strong>
            </div>
            <p className="rw-modal-meta">
              Worth {formatCurrency(issuedVoucher.valueZar)} · cost{" "}
              {issuedVoucher.pointsCost} pts · balance now {pointsBalance}
            </p>
            <div className="rw-modal-actions">
              <Link
                to={PROFILE_REWARDS}
                className="btn btn-outline"
                onClick={() => setIssuedVoucher(null)}
              >
                View on profile
              </Link>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIssuedVoucher(null)}
              >
                Keep earning
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
