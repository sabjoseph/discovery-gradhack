const express = require("express");
const supabase = require("../supabase");
const { classifyCategory, daysAgo } = require("../utils/health");

const router = express.Router();

const DEFAULT_MILESTONES = [
  {
    name: "First healthy basket",
    description: "Make a purchase with at least 50% healthy spend.",
    criteria: { type: "healthy_basket_pct", threshold: 50 },
    reward_value: 10,
  },
  {
    name: "Pantry pioneer",
    description: "Build a pantry with 10 or more items on hand.",
    criteria: { type: "pantry_count", threshold: 10 },
    reward_value: 15,
  },
  {
    name: "Healthy streak",
    description: "Reach 60% healthy spend over the last 30 days.",
    criteria: { type: "healthy_spend_pct_30d", threshold: 60 },
    reward_value: 25,
  },
  {
    name: "Cook from what you have",
    description: "Find a recipe with at least 70% pantry match.",
    criteria: { type: "recipe_match_pct", threshold: 70 },
    reward_value: 20,
  },
];

async function ensureMilestones() {
  const { data: existing, error } = await supabase.from("milestones").select("*");
  if (error) throw error;
  if (existing && existing.length > 0) return existing;

  const { data: inserted, error: insertError } = await supabase
    .from("milestones")
    .insert(DEFAULT_MILESTONES)
    .select();

  if (insertError) throw insertError;
  return inserted;
}

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const milestones = await ensureMilestones();

    const since = await daysAgo(30);

    const [{ data: baskets }, { data: pantry }, { data: recipes }, { data: achieved }] =
      await Promise.all([
        supabase
          .from("baskets")
          .select(
            `
            purchase_date,
            basket_items (
              line_total,
              products ( categories ( main_category ) )
            )
          `
          )
          .eq("customer_id", customerId)
          .gte("purchase_date", since),
        supabase
          .from("pantry_items")
          .select("id, quantity_remaining, products ( category_id )")
          .eq("customer_id", customerId)
          .gt("quantity_remaining", 0),
        supabase
          .from("recipes")
          .select("id, recipe_ingredients ( category_id )"),
        supabase
          .from("customer_milestones")
          .select("milestone_id, achieved_at, reward_status")
          .eq("customer_id", customerId),
      ]);

    let healthy = 0;
    let total = 0;
    let bestBasketHealthyPct = 0;

    for (const basket of baskets || []) {
      let bHealthy = 0;
      let bTotal = 0;
      for (const item of basket.basket_items || []) {
        const amount = Number(item.line_total || 0);
        const tag = classifyCategory(item.products?.categories?.main_category);
        if (tag === "healthy") {
          healthy += amount;
          bHealthy += amount;
        }
        total += amount;
        bTotal += amount;
      }
      if (bTotal > 0) {
        bestBasketHealthyPct = Math.max(
          bestBasketHealthyPct,
          Math.round((bHealthy / bTotal) * 100)
        );
      }
    }

    const healthySpendPct = total ? Math.round((healthy / total) * 100) : 0;
    const pantryCount = (pantry || []).length;
    const pantryCats = new Set(
      (pantry || []).map((p) => p.products?.category_id).filter((id) => id != null)
    );

    let bestRecipeMatch = 0;
    for (const recipe of recipes || []) {
      const ingredients = recipe.recipe_ingredients || [];
      if (!ingredients.length) continue;
      const match = ingredients.filter(
        (ing) => ing.category_id != null && pantryCats.has(ing.category_id)
      ).length;
      bestRecipeMatch = Math.max(
        bestRecipeMatch,
        Math.round((match / ingredients.length) * 100)
      );
    }

    const achievedMap = new Map(
      (achieved || []).map((row) => [row.milestone_id, row])
    );

    const progress = milestones.map((m) => {
      const criteria = m.criteria || {};
      let current = 0;
      let target = Number(criteria.threshold || 100);
      let met = false;

      switch (criteria.type) {
        case "healthy_basket_pct":
          current = bestBasketHealthyPct;
          met = current >= target;
          break;
        case "pantry_count":
          current = pantryCount;
          met = current >= target;
          break;
        case "healthy_spend_pct_30d":
          current = healthySpendPct;
          met = current >= target;
          break;
        case "recipe_match_pct":
          current = bestRecipeMatch;
          met = current >= target;
          break;
        default:
          current = 0;
      }

      const existing = achievedMap.get(m.id);
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        rewardValue: m.reward_value,
        current,
        target,
        percent: Math.min(100, Math.round((current / target) * 100)),
        achieved: Boolean(existing) || met,
        achievedAt: existing?.achieved_at || null,
        rewardStatus: existing?.reward_status || (met ? "earned" : "locked"),
      };
    });

    res.json({
      success: true,
      data: {
        stats: {
          healthySpendPct,
          pantryCount,
          bestRecipeMatch,
          bestBasketHealthyPct,
        },
        milestones: progress,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
