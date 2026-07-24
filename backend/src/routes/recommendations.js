const express = require("express");
const supabase = require("../supabase");

const router = express.Router();

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    const { data: stored } = await supabase
      .from("recommendations")
      .select(
        `
        id,
        reason,
        created_at,
        recipe_id,
        product_id,
        recipes ( id, name, prep_time_minutes, servings ),
        products ( id, name )
      `
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (stored && stored.length > 0) {
      return res.json({
        success: true,
        data: stored.map((row) => ({
          id: row.id,
          reason: row.reason,
          createdAt: row.created_at,
          type: row.recipe_id ? "recipe" : "product",
          recipe: row.recipes,
          product: row.products,
        })),
        source: "table",
      });
    }

    const [{ data: pantry }, { data: recipes }] = await Promise.all([
      supabase
        .from("pantry_items")
        .select("quantity_remaining, products ( category_id )")
        .eq("customer_id", customerId)
        .gt("quantity_remaining", 0),
      supabase
        .from("recipes")
        .select(
          `
          id,
          name,
          prep_time_minutes,
          servings,
          recipe_ingredients ( category_id )
        `
        ),
    ]);

    const pantryCats = new Set(
      (pantry || [])
        .map((p) => p.products?.category_id)
        .filter((id) => id != null)
    );

    const computed = (recipes || [])
      .map((recipe) => {
        const ingredients = recipe.recipe_ingredients || [];
        const total = ingredients.length || 1;
        const matchCount = ingredients.filter(
          (ing) => ing.category_id != null && pantryCats.has(ing.category_id)
        ).length;
        const matchPercent = Math.round((matchCount / total) * 100);
        return {
          id: `live-${recipe.id}`,
          type: "recipe",
          reason: `You already have ${matchCount} of ${ingredients.length} ingredients (${matchPercent}% pantry match).`,
          createdAt: new Date().toISOString(),
          recipe: {
            id: recipe.id,
            name: recipe.name,
            prep_time_minutes: recipe.prep_time_minutes,
            servings: recipe.servings,
          },
          product: null,
          matchPercent,
        };
      })
      .sort((a, b) => b.matchPercent - a.matchPercent)
      .slice(0, 5);

    res.json({ success: true, data: computed, source: "pantry_match" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
