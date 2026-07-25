const express = require("express");
const supabase = require("../config/supabase");
const {
  classifyFromLabel,
  daysAgo,
  getDatasetEndDate,
} = require("../utils/health");
const {
  REWARD_CATALOG,
  extractVouchers,
  withVouchers,
  buildVoucherFromReward,
} = require("../utils/vouchers");

const router = express.Router();

// Flat key-value criteria — progress calc just reads the one key present.
const DEFAULT_MILESTONES = [
  {
    name: "5 healthy baskets in a month",
    description:
      "Complete 5 shopping trips where at least half the spend is on healthy items.",
    criteria: { healthy_baskets: 5 },
    reward_value: 50,
  },
  {
    name: "Try 3 new recipes",
    description:
      "Accept 3 recipe recommendations — cook something new from your pantry matches.",
    criteria: { recipes_tried: 3 },
    reward_value: 30,
  },
  {
    name: "The Cookery",
    description:
      "Buy 10 healthy foods this month and unlock The Cookery voucher.",
    criteria: { healthy_foods: 10 },
    reward_value: 0,
  },
  {
    name: "Log in 5 days in a row",
    description: "Open BiteBetter on 5 consecutive days to keep your streak alive.",
    criteria: { login_streak: 5 },
    reward_value: 20,
  },
  {
    name: "Pantry pioneer",
    description: "Keep 10 or more items stocked in your pantry.",
    criteria: { pantry_items: 10 },
    reward_value: 15,
  },
  {
    name: "Healthy month",
    description: "Reach 60% healthy spend across your last 30 days of shopping.",
    criteria: { healthy_spend_pct: 60 },
    reward_value: 40,
  },
];

function criteriaKey(criteria = {}) {
  return Object.keys(criteria)[0] || null;
}

async function ensureMilestones() {
  const { data: existing, error } = await supabase.from("milestones").select("*");
  if (error) throw error;

  // Empty table → seed. Old type/threshold shape → replace with the flat starter set.
  const needsReseed =
    !existing?.length ||
    existing.some((row) => row.criteria && "type" in row.criteria);

  if (needsReseed) {
    if (existing?.length) {
      await supabase.from("customer_milestones").delete().neq("id", 0);
      await supabase.from("milestones").delete().neq("id", 0);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("milestones")
      .insert(DEFAULT_MILESTONES)
      .select();

    if (insertError) throw insertError;
    return inserted;
  }

  // Migrate The Cookery from meals_cooked → healthy_foods before inserting missing.
  const cookeryDefault = DEFAULT_MILESTONES.find(
    (m) => criteriaKey(m.criteria) === "healthy_foods"
  );
  let working = existing || [];
  const legacyCookery = working.find(
    (m) => criteriaKey(m.criteria) === "meals_cooked"
  );
  if (legacyCookery && cookeryDefault) {
    const { error: updateError } = await supabase
      .from("milestones")
      .update({
        name: cookeryDefault.name,
        description: cookeryDefault.description,
        criteria: cookeryDefault.criteria,
        reward_value: cookeryDefault.reward_value,
      })
      .eq("id", legacyCookery.id);
    if (updateError) throw updateError;
    legacyCookery.name = cookeryDefault.name;
    legacyCookery.description = cookeryDefault.description;
    legacyCookery.criteria = cookeryDefault.criteria;
    legacyCookery.reward_value = cookeryDefault.reward_value;
  }

  // Add any new default milestones that aren't in the DB yet (by criteria key).
  const existingKeys = new Set(
    working.map((row) => criteriaKey(row.criteria)).filter(Boolean)
  );
  const missing = DEFAULT_MILESTONES.filter(
    (m) => !existingKeys.has(criteriaKey(m.criteria))
  );

  if (missing.length) {
    const { data: added, error: addError } = await supabase
      .from("milestones")
      .insert(missing)
      .select();

    if (addError) throw addError;
    working = [...working, ...(added || [])];
  }

  // Keep The Cookery copy in sync if it already uses healthy_foods.
  const cookery = working.find(
    (m) => criteriaKey(m.criteria) === "healthy_foods"
  );
  if (
    cookery &&
    cookeryDefault &&
    (cookery.name !== cookeryDefault.name ||
      cookery.description !== cookeryDefault.description)
  ) {
    const { error: updateError } = await supabase
      .from("milestones")
      .update({
        name: cookeryDefault.name,
        description: cookeryDefault.description,
      })
      .eq("id", cookery.id);
    if (updateError) throw updateError;
    cookery.name = cookeryDefault.name;
    cookery.description = cookeryDefault.description;
  }

  return working;
}

async function grantBonusVoucher(customerId, criteriaKeyName) {
  const bonus =
    REWARD_CATALOG.find((r) => r.unlockCriteria === criteriaKeyName) || null;
  if (!bonus) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("health_goals")
    .eq("id", customerId)
    .maybeSingle();

  const healthGoals = profile?.health_goals ?? [];
  const vouchers = extractVouchers(healthGoals);
  if (vouchers.some((v) => v.rewardId === bonus.id)) return null;

  const voucher = buildVoucherFromReward(bonus);
  const nextGoals = withVouchers(healthGoals, [voucher, ...vouchers]);
  const updatedAt = new Date().toISOString();

  if (profile) {
    await supabase
      .from("user_profiles")
      .update({ health_goals: nextGoals, updated_at: updatedAt })
      .eq("id", customerId);
  } else {
    await supabase.from("user_profiles").insert({
      id: customerId,
      health_goals: nextGoals,
      updated_at: updatedAt,
    });
  }

  await supabase.from("activity_log").insert({
    customer_id: customerId,
    event_type: "voucher_redeemed",
    metadata: {
      rewardId: bonus.id,
      voucherId: voucher.id,
      code: voucher.code,
      points: 0,
      source: "milestone_bonus",
    },
  });

  return voucher;
}

function itemHealth(item) {
  const cat = item.products?.categories;
  const nested = cat?.health_classifications;
  const label = Array.isArray(nested)
    ? nested[0]?.classification
    : nested?.classification;
  return classifyFromLabel(label, cat?.main_category);
}

function isHealthyBasket(basket) {
  let healthy = 0;
  let total = 0;
  for (const item of basket.basket_items || []) {
    const amount = Number(item.line_total || 0);
    total += amount;
    if (itemHealth(item) === "healthy") healthy += amount;
  }
  return total > 0 && healthy / total >= 0.5;
}

function computeLoginStreak(events, anchorDate) {
  const days = new Set();
  for (const ev of events || []) {
    if (!ev.created_at) continue;
    days.add(new Date(ev.created_at).toISOString().slice(0, 10));
  }

  let streak = 0;
  const cursor = new Date(anchorDate);
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function recordSessionVisit(customerId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data: existing } = await supabase
    .from("activity_log")
    .select("id")
    .eq("customer_id", customerId)
    .eq("event_type", "session_visit")
    .gte("created_at", today.toISOString())
    .lt("created_at", tomorrow.toISOString())
    .limit(1);

  if (existing?.length) return;

  await supabase.from("activity_log").insert({
    customer_id: customerId,
    event_type: "session_visit",
    metadata: { source: "rewards" },
  });
}

/** Count unique recipes tried (accepts / views / meal-plan adds). */
function countRecipesTried(activity) {
  const keys = new Set();
  for (const ev of activity || []) {
    if (
      !["recommendation_accepted", "recipe_viewed", "recipe_tried"].includes(
        ev.event_type
      )
    ) {
      continue;
    }
    const meta = ev.metadata || {};
    if (meta.recipe_id != null) {
      keys.add(`recipe:${meta.recipe_id}`);
    } else if (meta.recommendation_id != null) {
      keys.add(`rec:${meta.recommendation_id}`);
    } else {
      keys.add(`ev:${ev.event_type}:${ev.created_at}`);
    }
  }
  return keys.size;
}

/**
 * Recompute progress and persist newly achieved milestones.
 * Call this before reading points so the balance stays in sync.
 */
async function syncCustomerMilestones(customerId, { recordVisit = false } = {}) {
  const milestones = await ensureMilestones();

  if (recordVisit) {
    await recordSessionVisit(customerId);
  }

  const since = await daysAgo(30);
  const datasetEnd = await getDatasetEndDate();

  const [
    { data: baskets },
    { data: pantry },
    { data: activity },
    { data: achieved },
  ] = await Promise.all([
    supabase
      .from("baskets")
      .select(
        `
        purchase_date,
        basket_items (
          line_total,
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
      .gte("purchase_date", since),
    supabase
      .from("pantry_items")
      .select("id")
      .eq("customer_id", customerId)
      .gt("quantity_remaining", 0),
    supabase
      .from("activity_log")
      .select("event_type, metadata, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("customer_milestones")
      .select("id, milestone_id, achieved_at, reward_status")
      .eq("customer_id", customerId),
  ]);

  let healthySpend = 0;
  let totalSpend = 0;
  let healthyBaskets = 0;
  let healthyFoods = 0;

  for (const basket of baskets || []) {
    if (isHealthyBasket(basket)) healthyBaskets += 1;
    for (const item of basket.basket_items || []) {
      const amount = Number(item.line_total || 0);
      totalSpend += amount;
      if (itemHealth(item) === "healthy") {
        healthySpend += amount;
        healthyFoods += Math.max(1, Number(item.quantity) || 1);
      }
    }
  }

  const healthySpendPct = totalSpend
    ? Math.round((healthySpend / totalSpend) * 100)
    : 0;
  const pantryItems = (pantry || []).length;
  const recipesTried = countRecipesTried(activity);

  const loginStreak = computeLoginStreak(
    (activity || []).filter((ev) =>
      ["session_visit", "login"].includes(ev.event_type)
    ),
    new Date()
  );

  const metrics = {
    healthy_baskets: healthyBaskets,
    recipes_tried: recipesTried,
    healthy_foods: healthyFoods,
    login_streak: loginStreak,
    pantry_items: pantryItems,
    healthy_spend_pct: healthySpendPct,
  };

  const achievedMap = new Map(
    (achieved || []).map((row) => [row.milestone_id, row])
  );

  const newlyAchieved = [];
  const progress = milestones.map((m) => {
    const key = criteriaKey(m.criteria);
    const target = Number(m.criteria?.[key] || 1);
    const current = Number(metrics[key] ?? 0);
    const met = current >= target;
    const existing = achievedMap.get(m.id);

    if (met && !existing) {
      newlyAchieved.push({ id: m.id, criteriaKey: key });
    }

    const isCookeryUnlock =
      Number(m.reward_value || 0) === 0 && key === "healthy_foods";

    return {
      id: m.id,
      name: m.name,
      description: m.description,
      rewardValue: m.reward_value,
      rewardLabel: isCookeryUnlock ? "Cookery unlock" : null,
      criteriaKey: key,
      current: Math.min(current, target),
      currentRaw: current,
      target,
      percent: Math.min(100, Math.round((current / target) * 100)),
      achieved: Boolean(existing) || met,
      achievedAt: existing?.achieved_at || (met ? new Date().toISOString() : null),
      rewardStatus: existing?.reward_status || (met ? "pending" : "in_progress"),
    };
  });

  if (newlyAchieved.length) {
    const rows = newlyAchieved.map((item) => ({
      customer_id: customerId,
      milestone_id: item.id,
      achieved_at: new Date().toISOString(),
      reward_status: "pending",
    }));
    const { data: inserted } = await supabase
      .from("customer_milestones")
      .insert(rows)
      .select("milestone_id, achieved_at, reward_status");

    for (const row of inserted || []) {
      const item = progress.find((p) => p.id === row.milestone_id);
      if (item) {
        item.achievedAt = row.achieved_at;
        item.rewardStatus = row.reward_status;
        item.achieved = true;
      }
    }

    for (const item of newlyAchieved) {
      if (item.criteriaKey === "healthy_foods") {
        const voucher = await grantBonusVoucher(customerId, "healthy_foods");
        const milestone = progress.find((p) => p.id === item.id);
        if (voucher && milestone) {
          milestone.rewardStatus = "issued";
          await supabase
            .from("customer_milestones")
            .update({ reward_status: "issued" })
            .eq("customer_id", customerId)
            .eq("milestone_id", item.id);
        }
      }
    }
  }

  const inProgress = progress.filter((m) => !m.achieved);
  const completed = progress.filter((m) => m.achieved);

  return {
    stats: {
      healthyBaskets,
      recipesTried,
      healthyFoods,
      loginStreak,
      pantryItems,
      healthySpendPct,
      datasetEnd: datasetEnd.toISOString(),
    },
    inProgress,
    completed,
    milestones: progress,
  };
}

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const data = await syncCustomerMilestones(customerId, { recordVisit: true });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.syncCustomerMilestones = syncCustomerMilestones;
