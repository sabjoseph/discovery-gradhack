/**
 * Verified allergen substitution mapping.
 *
 * Every row is tied to a cooking context, because a substitute that works as a
 * spread will not work as a binder. Nutrition is per 100 g (or per stated unit)
 * from USDA FoodData Central unless another source is named, so callers can show
 * an approximate comparison rather than claiming equivalence.
 *
 * `replacesAllergens` lists the allergen groups the row is intended to replace.
 * `containsAllergens` lists allergens present in the substitute itself, so a
 * substitute is never offered to someone allergic to it.
 *
 * `quantityRatio`: substitute quantity = original quantity x ratio.
 * `verified: false` rows are never shown.
 */
const INGREDIENT_SUBSTITUTIONS = [
  // ---- Milk / dairy liquid ----
  {
    id: "milk-to-soy",
    matches: ["milk", "fat free milk", "skim milk", "full cream milk", "low fat milk"],
    replacesAllergens: ["milk"],
    substitute: "Fortified unsweetened soy milk",
    containsAllergens: ["soy"],
    cookingContext: "dairy liquid",
    quantityRatio: 1,
    basis: "per 100 ml",
    nutrition: { calories: 33, protein_g: 2.8, carbohydrates_g: 1.8, fat_g: 1.6, fibre_g: 0.4 },
    originalNutrition: { calories: 34, protein_g: 3.4, carbohydrates_g: 5.0, fat_g: 0.1, fibre_g: 0 },
    source: "USDA FoodData Central - soy milk unsweetened fortified; milk nonfat fluid",
    verified: true,
  },
  {
    id: "milk-to-oat",
    matches: ["milk", "fat free milk", "skim milk", "full cream milk", "low fat milk"],
    replacesAllergens: ["milk"],
    substitute: "Fortified unsweetened oat milk",
    containsAllergens: [],
    cookingContext: "dairy liquid",
    quantityRatio: 1,
    basis: "per 100 ml",
    nutrition: { calories: 43, protein_g: 0.8, carbohydrates_g: 6.7, fat_g: 1.3, fibre_g: 0.8 },
    originalNutrition: { calories: 34, protein_g: 3.4, carbohydrates_g: 5.0, fat_g: 0.1, fibre_g: 0 },
    source: "USDA FoodData Central - oat milk unsweetened fortified; milk nonfat fluid",
    // Oat milk is not gluten-free unless certified; flagged so the UI can note it.
    caveat: "Choose a certified gluten-free oat milk if you also avoid wheat or gluten.",
    verified: true,
  },

  // ---- Yoghurt ----
  {
    id: "yoghurt-to-soy",
    matches: ["yoghurt", "yogurt", "plain yoghurt", "fat free plain yoghurt", "greek yoghurt"],
    replacesAllergens: ["milk"],
    substitute: "Unsweetened soy yoghurt",
    containsAllergens: ["soy"],
    cookingContext: "cultured dairy",
    quantityRatio: 1,
    basis: "per 100 g",
    nutrition: { calories: 60, protein_g: 3.5, carbohydrates_g: 6.0, fat_g: 2.0, fibre_g: 0.6 },
    originalNutrition: { calories: 56, protein_g: 5.7, carbohydrates_g: 7.7, fat_g: 0.2, fibre_g: 0 },
    source: "USDA FoodData Central - soy yogurt plain; yogurt plain skim milk",
    verified: true,
  },
  {
    id: "yoghurt-to-coconut",
    matches: ["yoghurt", "yogurt", "plain yoghurt", "fat free plain yoghurt", "greek yoghurt"],
    replacesAllergens: ["milk"],
    substitute: "Unsweetened coconut yoghurt",
    containsAllergens: ["tree_nuts"],
    cookingContext: "cultured dairy",
    quantityRatio: 1,
    basis: "per 100 g",
    nutrition: { calories: 97, protein_g: 0.9, carbohydrates_g: 7.0, fat_g: 7.2, fibre_g: 1.0 },
    originalNutrition: { calories: 56, protein_g: 5.7, carbohydrates_g: 7.7, fat_g: 0.2, fibre_g: 0 },
    source: "USDA FoodData Central - coconut milk yogurt plain",
    caveat: "Much lower in protein and higher in fat than dairy yoghurt.",
    verified: true,
  },

  // ---- Peanut butter ----
  {
    id: "peanut-butter-to-sunflower",
    matches: ["peanut butter", "peanuts", "peanut"],
    replacesAllergens: ["peanuts"],
    substitute: "Sunflower seed butter",
    containsAllergens: [],
    cookingContext: "spread or nut butter",
    quantityRatio: 1,
    basis: "per 100 g",
    nutrition: { calories: 617, protein_g: 17.3, carbohydrates_g: 23.3, fat_g: 55.2, fibre_g: 4.6 },
    originalNutrition: { calories: 588, protein_g: 25.1, carbohydrates_g: 19.6, fat_g: 50.4, fibre_g: 6.0 },
    source: "USDA FoodData Central - sunflower seed butter; peanut butter smooth",
    verified: true,
  },

  // ---- Wheat breadcrumbs ----
  {
    id: "breadcrumbs-to-gf",
    matches: ["breadcrumbs", "breadcrumb", "brown bread", "white bread", "bread"],
    replacesAllergens: ["wheat"],
    substitute: "Certified gluten-free breadcrumbs (rice or maize based)",
    containsAllergens: [],
    cookingContext: "dry binder or coating",
    quantityRatio: 1,
    basis: "per 100 g",
    nutrition: { calories: 375, protein_g: 6.0, carbohydrates_g: 79.0, fat_g: 3.0, fibre_g: 3.0 },
    originalNutrition: { calories: 395, protein_g: 13.4, carbohydrates_g: 71.9, fat_g: 5.3, fibre_g: 4.5 },
    source: "USDA FoodData Central - bread crumbs dry grated plain; gluten-free crumb average",
    caveat: "Lower in protein than wheat crumbs.",
    verified: true,
  },

  // ---- Egg as binder ----
  {
    id: "egg-to-flax",
    matches: ["egg", "eggs"],
    replacesAllergens: ["eggs"],
    substitute: "Ground flaxseed and water (1 tbsp flaxseed + 3 tbsp water per egg)",
    containsAllergens: [],
    cookingContext: "binder",
    quantityRatio: 1,
    basis: "per 1 egg equivalent",
    nutrition: { calories: 37, protein_g: 1.3, carbohydrates_g: 2.0, fat_g: 3.0, fibre_g: 1.9 },
    originalNutrition: { calories: 72, protein_g: 6.3, carbohydrates_g: 0.4, fat_g: 4.8, fibre_g: 0 },
    source: "USDA FoodData Central - flaxseed ground; egg whole raw fresh",
    caveat: "Works as a binder only. Not suitable where eggs provide aeration, such as meringue.",
    verified: true,
  },

  // ---- Butter as fat ----
  {
    id: "butter-to-olive-oil",
    matches: ["butter", "salted butter", "unsalted butter"],
    replacesAllergens: ["milk"],
    substitute: "Extra virgin olive oil",
    containsAllergens: [],
    cookingContext: "cooking fat",
    quantityRatio: 0.75,
    basis: "per 100 g",
    nutrition: { calories: 884, protein_g: 0, carbohydrates_g: 0, fat_g: 100, fibre_g: 0 },
    originalNutrition: { calories: 717, protein_g: 0.9, carbohydrates_g: 0.1, fat_g: 81.1, fibre_g: 0 },
    source: "USDA FoodData Central - olive oil; butter salted",
    caveat: "Use about three quarters of the butter quantity. Not suitable for creaming in baking.",
    verified: true,
  },

  // ---- Cream ----
  {
    id: "cream-to-coconut",
    matches: ["cream", "fresh cream", "double cream", "whipping cream"],
    replacesAllergens: ["milk"],
    substitute: "Coconut cream",
    containsAllergens: ["tree_nuts"],
    cookingContext: "dairy liquid",
    quantityRatio: 1,
    basis: "per 100 g",
    nutrition: { calories: 330, protein_g: 3.6, carbohydrates_g: 6.7, fat_g: 34.7, fibre_g: 2.2 },
    originalNutrition: { calories: 340, protein_g: 2.1, carbohydrates_g: 2.8, fat_g: 36.1, fibre_g: 0 },
    source: "USDA FoodData Central - coconut cream canned; cream heavy whipping",
    verified: true,
  },

  // ---- Tofu (soy) ----
  {
    id: "tofu-to-yoghurt",
    matches: ["tofu", "plain tofu", "silken tofu"],
    replacesAllergens: ["soy"],
    substitute: "Thick strained plain yoghurt",
    containsAllergens: ["milk"],
    cookingContext: "creamy protein base",
    quantityRatio: 1,
    basis: "per 100 g",
    nutrition: { calories: 56, protein_g: 5.7, carbohydrates_g: 7.7, fat_g: 0.2, fibre_g: 0 },
    originalNutrition: { calories: 76, protein_g: 8.1, carbohydrates_g: 1.9, fat_g: 4.8, fibre_g: 0.3 },
    source: "USDA FoodData Central - yogurt plain skim milk; tofu raw regular",
    caveat: "Higher in carbohydrate and not suitable for a dairy-free or vegan plan.",
    verified: true,
  },
];

module.exports = { INGREDIENT_SUBSTITUTIONS };
