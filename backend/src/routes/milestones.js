const express = require("express");
const supabase = require("../config/supabase");
const {
  classifyFromLabel,
  daysAgo,
  getDatasetEndDate,
} = require("../utils/health");

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

  if (!needsReseed) return existing;

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

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const milestones = await ensureMilestones();

    // Track a visit so the login-streak milestone can progress.
    await recordSessionVisit(customerId);

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

    for (const basket of baskets || []) {
      if (isHealthyBasket(basket)) healthyBaskets += 1;
      for (const item of basket.basket_items || []) {
        const amount = Number(item.line_total || 0);
        totalSpend += amount;
        if (itemHealth(item) === "healthy") healthySpend += amount;
      }
    }

    const healthySpendPct = totalSpend
      ? Math.round((healthySpend / totalSpend) * 100)
      : 0;
    const pantryItems = (pantry || []).length;

    const recipesTried = (activity || []).filter((ev) =>
      ["recommendation_accepted", "recipe_viewed", "recipe_tried"].includes(
        ev.event_type
      )
    ).length;

    const loginStreak = computeLoginStreak(
      (activity || []).filter((ev) =>
        ["session_visit", "login"].includes(ev.event_type)
      ),
      new Date()
    );

    const metrics = {
      healthy_baskets: healthyBaskets,
      recipes_tried: recipesTried,
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
        newlyAchieved.push(m.id);
      }

      return {
        id: m.id,
        name: m.name,
        description: m.description,
        rewardValue: m.reward_value,
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
      const rows = newlyAchieved.map((milestoneId) => ({
        customer_id: customerId,
        milestone_id: milestoneId,
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
    }

    const inProgress = progress.filter((m) => !m.achieved);
    const completed = progress.filter((m) => m.achieved);

    res.json({
      success: true,
      data: {
        stats: {
          healthyBaskets,
          recipesTried,
          loginStreak,
          pantryItems,
          healthySpendPct,
          datasetEnd: datasetEnd.toISOString(),
        },
        inProgress,
        completed,
        milestones: progress,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
