const express = require("express");
const supabase = require("../config/supabase");
const {
  REWARD_CATALOG,
  extractVouchers,
  withVouchers,
  pointsSpent,
  findReward,
  buildVoucherFromReward,
} = require("../utils/vouchers");

const router = express.Router();

async function getPointsEarned(customerId) {
  const [{ data: achieved, error: achError }, { data: milestones, error: milError }] =
    await Promise.all([
      supabase
        .from("customer_milestones")
        .select("milestone_id")
        .eq("customer_id", customerId),
      supabase.from("milestones").select("id, reward_value"),
    ]);

  if (achError) throw achError;
  if (milError) throw milError;

  const valueById = new Map(
    (milestones || []).map((m) => [m.id, Number(m.reward_value || 0)])
  );

  return (achieved || []).reduce(
    (sum, row) => sum + (valueById.get(row.milestone_id) || 0),
    0
  );
}

async function loadProfileGoals(customerId) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("health_goals")
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw error;
  return data?.health_goals ?? [];
}

async function saveVouchers(customerId, healthGoals, vouchers) {
  const nextGoals = withVouchers(healthGoals, vouchers);
  const updatedAt = new Date().toISOString();

  const { data: existing, error: readError } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("id", customerId)
    .maybeSingle();

  if (readError) throw readError;

  let data;
  if (existing) {
    const { data: updated, error } = await supabase
      .from("user_profiles")
      .update({ health_goals: nextGoals, updated_at: updatedAt })
      .eq("id", customerId)
      .select("health_goals")
      .single();
    if (error) throw error;
    data = updated;
  } else {
    const { data: inserted, error } = await supabase
      .from("user_profiles")
      .insert({
        id: customerId,
        health_goals: nextGoals,
        updated_at: updatedAt,
      })
      .select("health_goals")
      .single();
    if (error) throw error;
    data = inserted;
  }

  return extractVouchers(data.health_goals);
}

async function hasHealthyFoodsMilestone(customerId) {
  const { data: milestones } = await supabase
    .from("milestones")
    .select("id, criteria");
  const cookery = (milestones || []).find(
    (m) => m.criteria && "healthy_foods" in m.criteria
  );
  if (!cookery) return false;

  const { data: row } = await supabase
    .from("customer_milestones")
    .select("id")
    .eq("customer_id", customerId)
    .eq("milestone_id", cookery.id)
    .maybeSingle();

  return Boolean(row);
}

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    const [{ data: customer }, pointsEarned, healthGoals, cookeryUnlocked] =
      await Promise.all([
        supabase.from("customers").select("id, name").eq("id", customerId).single(),
        getPointsEarned(customerId),
        loadProfileGoals(customerId),
        hasHealthyFoodsMilestone(customerId),
      ]);

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const vouchers = extractVouchers(healthGoals);
    const spent = pointsSpent(vouchers);
    const balance = Math.max(0, pointsEarned - spent);
    const ownedIds = new Set(vouchers.map((v) => v.rewardId));

    res.json({
      success: true,
      data: {
        catalog: REWARD_CATALOG.map((r) => {
          const alreadyOwned = ownedIds.has(r.id);
          const locked =
            r.unlockCriteria === "healthy_foods" && !cookeryUnlocked;
          const canAfford =
            !locked &&
            !alreadyOwned &&
            (r.points === 0
              ? cookeryUnlocked || !r.unlockCriteria
              : balance >= r.points);
          return {
            ...r,
            locked,
            alreadyOwned,
            canAfford,
          };
        }),
        pointsEarned,
        pointsSpent: spent,
        pointsBalance: balance,
        vouchers,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/:customerId/redeem", async (req, res) => {
  try {
    const { customerId } = req.params;
    const rewardId = req.body?.rewardId;

    const reward = findReward(rewardId);
    if (!reward) {
      return res
        .status(400)
        .json({ success: false, message: "Unknown reward" });
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .maybeSingle();

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const [pointsEarned, healthGoals, cookeryUnlocked] = await Promise.all([
      getPointsEarned(customerId),
      loadProfileGoals(customerId),
      hasHealthyFoodsMilestone(customerId),
    ]);

    const vouchers = extractVouchers(healthGoals);

    if (reward.once && vouchers.some((v) => v.rewardId === reward.id)) {
      return res.status(400).json({
        success: false,
        message: "You already have this voucher",
      });
    }

    if (reward.unlockCriteria === "healthy_foods" && !cookeryUnlocked) {
      return res.status(400).json({
        success: false,
        message: "Buy 10 healthy foods this month to unlock The Cookery voucher",
      });
    }

    const spent = pointsSpent(vouchers);
    const balance = Math.max(0, pointsEarned - spent);

    if (balance < reward.points) {
      return res.status(400).json({
        success: false,
        message: `Not enough points — you need ${reward.points} pts (you have ${balance})`,
      });
    }

    const voucher = buildVoucherFromReward(reward);
    const nextVouchers = [voucher, ...vouchers];
    const saved = await saveVouchers(customerId, healthGoals, nextVouchers);
    const nextSpent = pointsSpent(saved);
    const nextBalance = Math.max(0, pointsEarned - nextSpent);

    await supabase.from("activity_log").insert({
      customer_id: customerId,
      event_type: "voucher_redeemed",
      metadata: {
        rewardId: reward.id,
        voucherId: voucher.id,
        code: voucher.code,
        points: reward.points,
      },
    });

    res.json({
      success: true,
      data: {
        voucher,
        pointsEarned,
        pointsSpent: nextSpent,
        pointsBalance: nextBalance,
        vouchers: saved,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
