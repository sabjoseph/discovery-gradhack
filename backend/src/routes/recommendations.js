const express = require("express");
const supabase = require("../config/supabase");
const { getDatasetEndDate } = require("../utils/health");

const router = express.Router();

// Simple rule-based scoring: rank recipes by pantry ingredient coverage.
async function scoreRecipesForCustomer(customerId) {
  const [{ data: pantry }, { data: recipes }] = await Promise.all([
    supabase
      .from("pantry_items")
      .select("quantity_remaining, products ( category_id )")
      .eq("customer_id", customerId)
      .gt("quantity_remaining", 0),
    supabase
      .from("recipes")
      .select("id, name, prep_time_minutes, servings, source, recipe_ingredients ( category_id )"),
  ]);

  const pantryCats = new Set(
    (pantry || []).map((p) => p.products?.category_id).filter((id) => id != null)
  );

  return (recipes || [])
    .map((recipe) => {
      const ingredients = recipe.recipe_ingredients || [];
      const total = ingredients.length || 1;
      const matchCount = ingredients.filter(
        (ing) => ing.category_id != null && pantryCats.has(ing.category_id)
      ).length;
      return {
        recipeId: recipe.id,
        name: recipe.name,
        matchCount,
        totalIngredients: ingredients.length,
        missingCount: ingredients.length - matchCount,
        matchPercent: Math.round((matchCount / total) * 100),
      };
    })
    .sort((a, b) => b.matchPercent - a.matchPercent || b.matchCount - a.matchCount);
}

function reasonFor(score) {
  if (score.matchPercent >= 80) {
    return `You have most of what this needs — ${score.matchCount} of ${score.totalIngredients} ingredients are already in your pantry.`;
  }
  if (score.matchPercent >= 50) {
    return `A good pantry fit: ${score.matchCount} of ${score.totalIngredients} ingredients on hand, only ${score.missingCount} to buy.`;
  }
  return `Worth a look — you already have ${score.matchCount} of ${score.totalIngredients} ingredients for this recipe.`;
}

async function generateRecommendations(customerId) {
  const scores = await scoreRecipesForCustomer(customerId);
  const top = scores.slice(0, 3);
  if (top.length === 0) return;

  const rows = top.map((score) => ({
    customer_id: customerId,
    recipe_id: score.recipeId,
    product_id: null,
    reason: reasonFor(score),
  }));

  const { error } = await supabase.from("recommendations").insert(rows);
  if (error) throw error;
}

// Budget context: what's left of budget_monthly for the dataset-end month.
async function getBudgetContext(customerId) {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("budget_monthly")
    .eq("id", customerId)
    .maybeSingle();

  const budgetMonthly =
    profile?.budget_monthly != null ? Number(profile.budget_monthly) : null;
  if (budgetMonthly == null || Number.isNaN(budgetMonthly)) return null;

  const datasetEnd = await getDatasetEndDate(customerId);
  const { spendStatsForWindow, windowStartFor } = require("../utils/budgetMonth");
  const windowStart = windowStartFor(datasetEnd);

  const { data: baskets } = await supabase
    .from("baskets")
    .select("purchase_date, retailers ( name ), basket_items ( line_total, unit_price )")
    .eq("customer_id", customerId)
    .gte("purchase_date", windowStart.toISOString());

  const monthSpend = spendStatsForWindow(baskets, windowStart, datasetEnd).monthSpend;

  let priceSum = 0;
  let priceCount = 0;
  for (const basket of baskets || []) {
    for (const item of basket.basket_items || []) {
      if (item.unit_price != null) {
        priceSum += Number(item.unit_price);
        priceCount += 1;
      }
    }
  }

  return {
    budgetMonthly,
    monthSpend,
    remaining: budgetMonthly - monthSpend,
    // rough per-item cost estimate from this customer's own shopping
    avgItemPrice: priceCount ? priceSum / priceCount : 60,
  };
}

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 7);

    const { data: existing, error: existingError } = await supabase
      .from("recommendations")
      .select("id")
      .eq("customer_id", customerId)
      .gte("created_at", recentCutoff.toISOString())
      .limit(1);

    if (existingError) throw existingError;

    if (!existing || existing.length === 0) {
      await generateRecommendations(customerId);
    }

    const [{ data: stored, error: storedError }, scores, budget] =
      await Promise.all([
        supabase
          .from("recommendations")
          .select(
            `
            id,
            reason,
            created_at,
            recipe_id,
            product_id,
            recipes ( id, name, prep_time_minutes, servings, source ),
            products ( id, name )
          `
          )
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(10),
        scoreRecipesForCustomer(customerId),
        getBudgetContext(customerId),
      ]);

    if (storedError) throw storedError;

    const scoreByRecipe = new Map(scores.map((s) => [s.recipeId, s]));

    let feed = (stored || []).map((row) => {
      const score = row.recipe_id ? scoreByRecipe.get(row.recipe_id) : null;
      const estimatedMissingCost =
        score && budget ? Math.round(score.missingCount * budget.avgItemPrice) : null;
      return {
        id: row.id,
        reason: row.reason,
        createdAt: row.created_at,
        type: row.recipe_id ? "recipe" : "product",
        recipe: row.recipes,
        product: row.products,
        matchPercent: score?.matchPercent ?? null,
        matchCount: score?.matchCount ?? null,
        totalIngredients: score?.totalIngredients ?? null,
        estimatedMissingCost,
      };
    });

    // Budget filter: drop recipes whose missing-ingredient cost clearly
    // exceeds what's left this month. Skipped entirely when no budget is set.
    if (budget) {
      feed = feed.filter(
        (item) =>
          item.type !== "recipe" ||
          item.estimatedMissingCost == null ||
          item.estimatedMissingCost <= Math.max(0, budget.remaining)
      );
    }

    res.json({
      success: true,
      data: feed,
      budget,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/:customerId/:recommendationId/action", async (req, res) => {
  try {
    const { customerId, recommendationId } = req.params;
    const action = req.body?.action;

    if (!["accepted", "dismissed"].includes(action)) {
      return res
        .status(400)
        .json({ success: false, message: "action must be accepted or dismissed" });
    }

    const { data: recommendation } = await supabase
      .from("recommendations")
      .select("id, recipe_id, product_id")
      .eq("id", recommendationId)
      .eq("customer_id", customerId)
      .maybeSingle();

    const { error } = await supabase.from("activity_log").insert({
      customer_id: customerId,
      event_type: `recommendation_${action}`,
      metadata: {
        recommendation_id: Number(recommendationId),
        recipe_id: recommendation?.recipe_id ?? null,
        product_id: recommendation?.product_id ?? null,
      },
    });

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
