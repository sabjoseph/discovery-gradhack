const express = require("express");
const supabase = require("../config/supabase");
const {
  classifyFromLabel,
  daysAgo,
  daysUntilFrom,
  getDatasetEndDate,
} = require("../utils/health");

const router = express.Router();

function classificationFromItem(item) {
  const nested = item.products?.categories?.health_classifications;
  const label = Array.isArray(nested)
    ? nested[0]?.classification
    : nested?.classification;
  if (label) return classifyFromLabel(label);
  return classifyFromLabel(null, item.products?.categories?.main_category);
}

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const days = Number(req.query.days || 30);
    const since = await daysAgo(days);
    const datasetEnd = await getDatasetEndDate();

    const monthStart = new Date(datasetEnd);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      { data: baskets, error: basketError },
      { data: pantry, error: pantryError },
      { data: profile },
      { data: recipes, error: recipeError },
      { data: monthBaskets, error: monthError },
    ] = await Promise.all([
      supabase
        .from("baskets")
        .select(
          `
          id,
          purchase_date,
          retailer_id,
          retailers ( name ),
          basket_items (
            id,
            quantity,
            line_total,
            products (
              id,
              name,
              category_id,
              categories (
                id,
                main_category,
                subcategory,
                health_classifications ( classification )
              )
            )
          )
        `
        )
        .eq("customer_id", customerId)
        .gte("purchase_date", since)
        .order("purchase_date", { ascending: false }),
      supabase
        .from("pantry_items")
        .select(
          `
          id,
          quantity_remaining,
          expiry_estimate,
          products (
            id,
            name,
            category_id,
            categories ( subcategory )
          )
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
      supabase
        .from("baskets")
        .select(
          `
          purchase_date,
          basket_items ( line_total )
        `
        )
        .eq("customer_id", customerId)
        .gte("purchase_date", monthStart.toISOString()),
    ]);

    if (basketError) throw basketError;
    if (pantryError) throw pantryError;
    if (recipeError) throw recipeError;
    if (monthError) throw monthError;

    const spend = { healthy: 0, neutral: 0, unhealthy: 0, total: 0 };
    const dailyMap = new Map();

    for (const basket of baskets || []) {
      const dayKey = (basket.purchase_date || "").slice(0, 10);
      let dayTotal = dailyMap.get(dayKey) || 0;

      for (const item of basket.basket_items || []) {
        const amount = Number(item.line_total || 0);
        const tag = classificationFromItem(item);
        spend[tag] += amount;
        spend.total += amount;
        dayTotal += amount;
      }

      dailyMap.set(dayKey, dayTotal);
    }

    const spendTrend = [...dailyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, total]) => ({
        date,
        label: new Date(date).toLocaleDateString("en-ZA", { weekday: "short" }).toUpperCase(),
        total,
      }));

    const pantryItems = pantry || [];
    const pantryWithExpiry = pantryItems
      .map((p) => {
        const daysLeft = daysUntilFrom(p.expiry_estimate, datasetEnd);
        return {
          id: p.id,
          name: p.products?.name || "Unknown product",
          quantity: Number(p.quantity_remaining),
          expiryEstimate: p.expiry_estimate,
          daysLeft,
          category: p.products?.categories?.subcategory || "Uncategorised",
        };
      })
      .filter((p) => p.daysLeft !== null);

    const expiredItems = pantryWithExpiry
      .filter((p) => p.daysLeft < 0)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    const expiringItems = pantryWithExpiry
      .filter((p) => p.daysLeft >= 0 && p.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    const freshCount = Math.max(
      0,
      pantryItems.length - expiredItems.length - expiringItems.length
    );

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
      .sort(
        (a, b) =>
          b.matchPercent - a.matchPercent || b.matchCount - a.matchCount
      )
      .slice(0, 3);

    const latestBasket = (baskets || [])[0] || null;
    const recentBasket = latestBasket
      ? {
          id: latestBasket.id,
          purchaseDate: latestBasket.purchase_date,
          retailer: latestBasket.retailers?.name || latestBasket.retailer_id,
          items: (latestBasket.basket_items || []).slice(0, 4).map((item) => ({
            id: item.id,
            name: item.products?.name || "Unknown product",
            quantity: item.quantity,
            lineTotal: item.line_total,
            healthTag: classificationFromItem(item),
            category: item.products?.categories?.subcategory,
          })),
          itemCount: (latestBasket.basket_items || []).length,
        }
      : null;

    let monthSpend = 0;
    for (const basket of monthBaskets || []) {
      for (const item of basket.basket_items || []) {
        monthSpend += Number(item.line_total || 0);
      }
    }

    const healthGoals = Array.isArray(profile?.health_goals)
      ? profile.health_goals.filter((x) => typeof x === "string")
      : [];
    const dietaryPreferences = Array.isArray(profile?.dietary_preferences)
      ? profile.dietary_preferences.filter((x) => typeof x === "string")
      : [];

    const budgetMonthly =
      profile?.budget_monthly != null ? Number(profile.budget_monthly) : null;
    const budgetSection =
      budgetMonthly != null && !Number.isNaN(budgetMonthly)
        ? {
            budgetMonthly,
            monthSpend,
            remaining: budgetMonthly - monthSpend,
            usedPct: budgetMonthly
              ? Math.min(100, Math.round((monthSpend / budgetMonthly) * 100))
              : 0,
            dietaryPreferences,
            healthGoals,
          }
        : null;

    const pantryStockedPct = Math.min(
      100,
      Math.round((pantryItems.length / 30) * 100)
    );

    res.json({
      success: true,
      data: {
        periodDays: days,
        datasetEnd: datasetEnd.toISOString(),
        healthGoals,
        dietaryPreferences,
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
        spendTrend,
        pantry: {
          count: pantryItems.length,
          stockedPct: pantryStockedPct,
          expiredCount: expiredItems.length,
          expiringSoon: expiringItems.length,
          freshCount,
          expiredItems: expiredItems.slice(0, 5),
          expiringItems,
        },
        topRecipes,
        recentBasket,
        budget: budgetSection,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
