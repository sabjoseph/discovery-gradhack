const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

async function getPantryCategoryIds(customerId) {
  const { data, error } = await supabase
    .from("pantry_items")
    .select("quantity_remaining, products ( category_id )")
    .eq("customer_id", customerId)
    .gt("quantity_remaining", 0);

  if (error) throw error;

  const ids = new Set();
  for (const row of data || []) {
    const catId = row.products?.category_id;
    if (catId != null) ids.add(catId);
  }
  return ids;
}

function mapNutrition(recipe) {
  return {
    calories: recipe.calories_per_serving,
    protein: recipe.protein_g_per_serving,
    carbohydrates: recipe.carbohydrates_g_per_serving,
    sugar: recipe.sugar_g_per_serving,
    totalFat: recipe.fat_g_per_serving,
    saturatedFat: recipe.saturated_fat_g_per_serving,
    fibre: recipe.fibre_g_per_serving,
    sodium: recipe.sodium_mg_per_serving,
    sodiumUnit: "mg",
  };
}

function scoreRecipe(recipe, pantryCats) {
  const ingredients = recipe.recipe_ingredients || [];
  const total = ingredients.length || 1;
  let have = 0;
  const haveList = [];
  const needList = [];

  for (const ing of ingredients) {
    const covered =
      (ing.category_id != null && pantryCats.has(ing.category_id)) ||
      (ing.product_id != null && false);

    const entry = {
      id: ing.id,
      name: ing.ingredient_name,
      quantity: ing.quantity_required,
      unit: ing.unit,
      categoryId: ing.category_id,
    };

    if (covered) {
      have += 1;
      haveList.push(entry);
    } else {
      needList.push(entry);
    }
  }

  return {
    matchCount: have,
    totalIngredients: ingredients.length,
    matchPercent: Math.round((have / total) * 100),
    have: haveList,
    need: needList,
  };
}

router.get("/", async (req, res) => {
  try {
    const customerId = req.query.customerId;
    const { data: recipes, error } = await supabase
      .from("recipes")
      .select(
        `
        id,
        name,
        instructions,
        prep_time_minutes,
        health_score,
        source,
        servings,
        calories_per_serving,
        protein_g_per_serving,
        carbohydrates_g_per_serving,
        sugar_g_per_serving,
        fat_g_per_serving,
        saturated_fat_g_per_serving,
        fibre_g_per_serving,
        sodium_mg_per_serving,
        recipe_ingredients (
          id,
          ingredient_name,
          product_id,
          category_id,
          quantity_required,
          unit,
          categories ( id, main_category, subcategory )
        )
      `
      )
      .order("id", { ascending: true });

    if (error) throw error;

    let pantryCats = new Set();
    if (customerId) {
      pantryCats = await getPantryCategoryIds(customerId);
    }

    const mapped = (recipes || []).map((recipe) => {
      const score = scoreRecipe(recipe, pantryCats);
      const categorySet = new Set();
      for (const ing of recipe.recipe_ingredients || []) {
        const label =
          ing.categories?.subcategory != null &&
          String(ing.categories.subcategory).trim() !== ""
            ? String(ing.categories.subcategory).trim()
            : "Uncategorised";
        categorySet.add(label);
      }
      const categories =
        categorySet.size > 0 ? [...categorySet] : ["Uncategorised"];

      return {
        id: recipe.id,
        name: recipe.name,
        instructions: recipe.instructions,
        prepTimeMinutes: recipe.prep_time_minutes,
        healthScore: recipe.health_score,
        source: recipe.source,
        servings: recipe.servings,
        ingredientCount: recipe.recipe_ingredients?.length || 0,
        categories,
        nutrition: mapNutrition(recipe),
        ...score,
      };
    });

    mapped.sort((a, b) => b.matchPercent - a.matchPercent || b.matchCount - a.matchCount);

    res.json({ success: true, data: mapped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** Log a recipe added to the meal plan (counts toward Try 3 new recipes). */
router.post("/tried", async (req, res) => {
  try {
    const customerId = req.body?.customerId;
    const recipeId = req.body?.recipeId;
    if (!customerId || recipeId == null) {
      return res.status(400).json({
        success: false,
        message: "customerId and recipeId are required",
      });
    }

    const { error } = await supabase.from("activity_log").insert({
      customer_id: customerId,
      event_type: "recipe_tried",
      metadata: { recipe_id: Number(recipeId) || recipeId },
    });

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const customerId = req.query.customerId;
    const { data: recipe, error } = await supabase
      .from("recipes")
      .select(
        `
        id,
        name,
        instructions,
        prep_time_minutes,
        health_score,
        source,
        servings,
        calories_per_serving,
        protein_g_per_serving,
        carbohydrates_g_per_serving,
        sugar_g_per_serving,
        fat_g_per_serving,
        saturated_fat_g_per_serving,
        fibre_g_per_serving,
        sodium_mg_per_serving,
        recipe_ingredients (
          id,
          ingredient_name,
          product_id,
          category_id,
          quantity_required,
          unit,
          categories ( id, main_category, subcategory )
        )
      `
      )
      .eq("id", req.params.id)
      .single();

    if (error) throw error;

    let pantryCats = new Set();
    if (customerId) {
      pantryCats = await getPantryCategoryIds(customerId);
    }

    const score = scoreRecipe(recipe, pantryCats);

    res.json({
      success: true,
      data: {
        id: recipe.id,
        name: recipe.name,
        instructions: recipe.instructions,
        prepTimeMinutes: recipe.prep_time_minutes,
        healthScore: recipe.health_score,
        source: recipe.source,
        servings: recipe.servings,
        nutrition: mapNutrition(recipe),
        ingredients: (recipe.recipe_ingredients || []).map((ing) => ({
          id: ing.id,
          name: ing.ingredient_name,
          quantity: ing.quantity_required,
          unit: ing.unit,
          categoryId: ing.category_id,
          category:
            ing.categories?.subcategory != null &&
            String(ing.categories.subcategory).trim() !== ""
              ? String(ing.categories.subcategory).trim()
              : "Uncategorised",
          have:
            ing.category_id != null && pantryCats.has(ing.category_id),
        })),
        ...score,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.getPantryCategoryIds = getPantryCategoryIds;
module.exports.scoreRecipe = scoreRecipe;
