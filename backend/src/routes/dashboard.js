const express = require("express");
const supabase = require("../supabase");
const { classifyCategory, daysAgo, daysUntilFrom, getDatasetEndDate } = require("../utils/health");

const router = express.Router();

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const days = Number(req.query.days || 30);
    const since = await daysAgo(days);

    const [{ data: baskets, error: basketError }, { data: pantry, error: pantryError }, { data: profile }, { data: recipes, error: recipeError }] =
      await Promise.all([
        supabase
          .from("baskets")
          .select(
            `
            id,
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
          .select(
            `
            id,
            quantity_remaining,
            expiry_estimate,
            products ( category_id )
          `
          )
          .eq("customer_id", customerId)
          .gt("quantity_remaining", 0),
        supabase
          .from("user_profiles")
          .select("budget_monthly, dietary_preferences, health_goals")
          .eq("id", customerId)
          .maybeSingle(),
        supabase
          .from("recipes")
          .select(
            `
            id,
            name,
            prep_time_minutes,
            servings,
            source,
            recipe_ingredients ( id, category_id, ingredient_name )
          `
          ),
      ]);

    if (basketError) throw basketError;
    if (pantryError) throw pantryError;
    if (recipeError) throw recipeError;

    const spend = { healthy: 0, neutral: 0, unhealthy: 0, total: 0 };
    for (const basket of baskets || []) {
      for (const item of basket.basket_items || []) {
        const amount = Number(item.line_total || 0);
        const tag = classifyCategory(item.products?.categories?.main_category);
        spend[tag] += amount;
        spend.total += amount;
      }
    }

    const pantryItems = pantry || [];
    const datasetEnd = await getDatasetEndDate();
    const expiringSoon = pantryItems.filter((p) => {
      const d = daysUntilFrom(p.expiry_estimate, datasetEnd);
      return d !== null && d >= 0 && d <= 7;
    }).length;

    const pantryCats = new Set(
      pantryItems.map((p) => p.products?.category_id).filter((id) => id != null)
    );

    const topRecipes = (recipes || [])
      .map((recipe) => {
        const ingredients = recipe.recipe_ingredients || [];
        const total = ingredients.length || 1;
        const matchCount = ingredients.filter(
          (ing) => ing.category_id != null && pantryCats.has(ing.category_id)
        ).length;
        return {
          id: recipe.id,
          name: recipe.name,
          prepTimeMinutes: recipe.prep_time_minutes,
          servings: recipe.servings,
          source: recipe.source,
          matchCount,
          totalIngredients: ingredients.length,
          matchPercent: Math.round((matchCount / total) * 100),
        };
      })
      .sort((a, b) => b.matchPercent - a.matchPercent)
      .slice(0, 3);

    const hasProfile =
      profile &&
      (profile.budget_monthly != null ||
        profile.dietary_preferences != null ||
        profile.health_goals != null);

    res.json({
      success: true,
      data: {
        periodDays: days,
        spend: {
          ...spend,
          healthyPct: spend.total
            ? Math.round((spend.healthy / spend.total) * 100)
            : 0,
          neutralPct: spend.total
            ? Math.round((spend.neutral / spend.total) * 100)
            : 0,
          unhealthyPct: spend.total
            ? Math.round((spend.unhealthy / spend.total) * 100)
            : 0,
        },
        pantry: {
          count: pantryItems.length,
          expiringSoon,
        },
        topRecipes,
        profile: hasProfile ? profile : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
