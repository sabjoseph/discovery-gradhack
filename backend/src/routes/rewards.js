const express = require("express");
const supabase = require("../config/supabase");
const { classifyFromLabel, daysAgo } = require("../utils/health");
const {
  REWARD_CATALOG,
  extractVouchers,
  withVouchers,
  pointsSpent,
  findReward,
  buildVoucherFromReward,
} = require("../utils/vouchers");

const router = express.Router();
const COOKERY_TARGET = 10;

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

function itemHealth(item) {
  const cat = item.products?.categories;
  const nested = cat?.health_classifications;
  const label = Array.isArray(nested)
    ? nested[0]?.classification
    : nested?.classification;
  return classifyFromLabel(label, cat?.main_category);
}

async function countHealthyFoods(customerId) {
  const since = await daysAgo(30);
  const { data: baskets, error } = await supabase
    .from("baskets")
    .select(
      `
      basket_items (
        quantity,
        products (
          categories (
            main_category,
            health_classifications ( classification )
          )
        )
      )
    `
    )
    .eq("customer_id", customerId)
    .gte("purchase_date", since);

  if (error) throw error;

  let healthyFoods = 0;
  for (const basket of baskets || []) {
    for (const item of basket.basket_items || []) {
      if (itemHealth(item) === "healthy") {
        healthyFoods += Math.max(1, Number(item.quantity) || 1);
      }
    }
  }
  return healthyFoods;
}

async function ensureCookeryMilestone(customerId, healthyFoods) {
  const { data: milestones } = await supabase
    .from("milestones")
    .select("id, criteria");
  const cookery = (milestones || []).find(
    (m) => m.criteria && typeof m.criteria === "object" && "healthy_foods" in m.criteria
  );
  if (!cookery) {
    return { unlocked: healthyFoods >= COOKERY_TARGET, milestoneId: null };
  }

  const { data: row } = await supabase
    .from("customer_milestones")
    .select("id")
    .eq("customer_id", customerId)
    .eq("milestone_id", cookery.id)
    .maybeSingle();

  const unlocked = Boolean(row) || healthyFoods >= COOKERY_TARGET;

  if (!row && healthyFoods >= COOKERY_TARGET) {
    await supabase.from("customer_milestones").insert({
      customer_id: customerId,
      milestone_id: cookery.id,
      achieved_at: new Date().toISOString(),
      reward_status: "pending",
    });
  }

  return { unlocked, milestoneId: cookery.id };
}

async function ensureCookeryVoucher(customerId, healthGoals, unlocked) {
  if (!unlocked) {
    return {
      vouchers: extractVouchers(healthGoals),
      healthGoals,
      issued: null,
    };
  }

  const vouchers = extractVouchers(healthGoals);
  const reward = findReward("discovery-cookery");
  if (!reward || vouchers.some((v) => v.rewardId === reward.id)) {
    return { vouchers, healthGoals, issued: null };
  }

  const voucher = buildVoucherFromReward(reward);
  const next = [voucher, ...vouchers];
  const saved = await saveVouchers(customerId, healthGoals, next);

  await supabase.from("activity_log").insert({
    customer_id: customerId,
    event_type: "voucher_redeemed",
    metadata: {
      rewardId: reward.id,
      voucherId: voucher.id,
      code: voucher.code,
      points: 0,
      source: "cookery_unlock",
    },
  });

  if (reward.unlockCriteria === "healthy_foods") {
    const { data: milestones } = await supabase
      .from("milestones")
      .select("id, criteria");
    const cookery = (milestones || []).find(
      (m) =>
        m.criteria &&
        typeof m.criteria === "object" &&
        "healthy_foods" in m.criteria
    );
    if (cookery) {
      await supabase
        .from("customer_milestones")
        .update({ reward_status: "issued" })
        .eq("customer_id", customerId)
        .eq("milestone_id", cookery.id);
    }
  }

  return {
    vouchers: saved,
    healthGoals: withVouchers(healthGoals, saved),
    issued: voucher,
  };
}

function buildCatalog({ balance, cookeryUnlocked, ownedIds, healthyFoods }) {
  return REWARD_CATALOG.map((r) => {
    const alreadyOwned = ownedIds.has(r.id);
    const isCookery = r.unlockCriteria === "healthy_foods";
    const locked = isCookery && !cookeryUnlocked;
    const canAfford = isCookery
      ? cookeryUnlocked && !alreadyOwned
      : !alreadyOwned && balance >= r.points;

    return {
      ...r,
      locked,
      alreadyOwned,
      canAfford,
      progress:
        isCookery && !alreadyOwned
          ? {
              current: Math.min(COOKERY_TARGET, healthyFoods),
              target: COOKERY_TARGET,
            }
          : null,
    };
  });
}

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    // Persist any newly met milestones (e.g. 3 recipes) before reading points.
    const { syncCustomerMilestones } = require("./milestones");
    await syncCustomerMilestones(customerId);

    const [{ data: customer }, pointsEarned, healthGoals, healthyFoods] =
      await Promise.all([
        supabase.from("customers").select("id, name").eq("id", customerId).single(),
        getPointsEarned(customerId),
        loadProfileGoals(customerId),
        countHealthyFoods(customerId),
      ]);

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const { unlocked: cookeryUnlocked } = await ensureCookeryMilestone(
      customerId,
      healthyFoods
    );

    const ensured = await ensureCookeryVoucher(
      customerId,
      healthGoals,
      cookeryUnlocked
    );

    const vouchers = ensured.vouchers;
    const spent = pointsSpent(vouchers);
    const balance = Math.max(0, pointsEarned - spent);
    const ownedIds = new Set(vouchers.map((v) => v.rewardId));

    res.json({
      success: true,
      data: {
        catalog: buildCatalog({
          balance,
          cookeryUnlocked,
          ownedIds,
          healthyFoods,
        }),
        pointsEarned,
        pointsSpent: spent,
        pointsBalance: balance,
        vouchers,
        healthyFoods,
        cookeryUnlocked,
        issuedVoucher: ensured.issued,
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

    const { syncCustomerMilestones } = require("./milestones");
    await syncCustomerMilestones(customerId);

    const [pointsEarned, healthGoals, healthyFoods] = await Promise.all([
      getPointsEarned(customerId),
      loadProfileGoals(customerId),
      countHealthyFoods(customerId),
    ]);

    const { unlocked: cookeryUnlocked } = await ensureCookeryMilestone(
      customerId,
      healthyFoods
    );

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
        message: `Buy ${COOKERY_TARGET} healthy foods this month to unlock The Cookery voucher (you have ${healthyFoods})`,
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
    const ownedIds = new Set(saved.map((v) => v.rewardId));

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

    if (reward.unlockCriteria === "healthy_foods") {
      const { data: milestones } = await supabase
        .from("milestones")
        .select("id, criteria");
      const cookery = (milestones || []).find(
        (m) =>
          m.criteria &&
          typeof m.criteria === "object" &&
          "healthy_foods" in m.criteria
      );
      if (cookery) {
        await supabase
          .from("customer_milestones")
          .update({ reward_status: "issued" })
          .eq("customer_id", customerId)
          .eq("milestone_id", cookery.id);
      }
    }

    res.json({
      success: true,
      data: {
        voucher,
        pointsEarned,
        pointsSpent: nextSpent,
        pointsBalance: nextBalance,
        vouchers: saved,
        healthyFoods,
        cookeryUnlocked: true,
        catalog: buildCatalog({
          balance: nextBalance,
          cookeryUnlocked: true,
          ownedIds,
          healthyFoods,
        }),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
