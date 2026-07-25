const { ingredientMatchesAllergen } = require("./allergenMatch");
const { ALLERGENS } = require("../data/allergens");

const allergenById = new Map(ALLERGENS.map((a) => [a.id, a]));

function hasAllergenGroup(ingredients, allergenId) {
  const allergen = allergenById.get(allergenId);
  if (!allergen) return false;
  return ingredients.some((ing) =>
    ingredientMatchesAllergen(ing?.ingredient_name ?? ing?.name ?? "", allergen)
  );
}

const MEAT_TERMS = [
  "chicken", "beef", "lamb", "mutton", "pork", "bacon", "ham", "sausage",
  "boerewors", "polony", "ostrich", "venison", "biltong", "turkey", "duck",
  "mince", "steak", "gelatine", "gelatin", "lard", "stock cube",
];

const MEAT_CATEGORIES = ["Chicken", "Ostrich and venison"];
const SEAFOOD_CATEGORIES = ["Fish and seafood", "Tinned fish and seafood"];

function categoryOf(ing) {
  return (
    ing?.categories?.subcategory ??
    ing?.category ??
    null
  );
}

function matchesTerm(name, terms) {
  const raw = String(name || "").toLowerCase();
  return terms.some((term) => new RegExp(`\\b${term}\\b`, "i").test(raw));
}

function containsMeat(ingredients) {
  return ingredients.some((ing) => {
    const name = ing?.ingredient_name ?? ing?.name ?? "";
    const category = categoryOf(ing);
    if (category && MEAT_CATEGORIES.includes(category)) return true;
    // "chicken broth" / "vegetable or chicken broth" counts as non-vegetarian
    return matchesTerm(name, MEAT_TERMS);
  });
}

function containsSeafood(ingredients) {
  return ingredients.some((ing) => {
    const category = categoryOf(ing);
    if (category && SEAFOOD_CATEGORIES.includes(category)) return true;
    return (
      hasAllergenGroup([ing], "fish") || hasAllergenGroup([ing], "shellfish")
    );
  });
}

function containsHoney(ingredients) {
  return ingredients.some((ing) =>
    matchesTerm(ing?.ingredient_name ?? ing?.name ?? "", ["honey"])
  );
}

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Dietary preferences the app can verify from stored data.
 *
 * Each preference is evaluated from the recipe's ingredient rows (names plus the
 * joined category) or its stored per-serving nutrition. A recipe title is never
 * used as evidence. `evaluate` returns true (satisfied), false (not satisfied) or
 * null (not enough stored data to decide).
 */
const DIETARY_PREFERENCES = [
  {
    id: "vegetarian",
    label: "Vegetarian",
    basis: "No meat, poultry, game or seafood ingredients",
    evaluate: ({ ingredients }) => {
      if (ingredients.length === 0) return null;
      return !containsMeat(ingredients) && !containsSeafood(ingredients);
    },
  },
  {
    id: "vegan",
    label: "Vegan",
    basis: "No animal ingredients, including dairy, eggs and honey",
    evaluate: ({ ingredients }) => {
      if (ingredients.length === 0) return null;
      return (
        !containsMeat(ingredients) &&
        !containsSeafood(ingredients) &&
        !hasAllergenGroup(ingredients, "milk") &&
        !hasAllergenGroup(ingredients, "eggs") &&
        !containsHoney(ingredients)
      );
    },
  },
  {
    id: "plant_based",
    label: "Plant based",
    basis: "No animal ingredients, including dairy, eggs and honey",
    evaluate: ({ ingredients }) => {
      if (ingredients.length === 0) return null;
      return (
        !containsMeat(ingredients) &&
        !containsSeafood(ingredients) &&
        !hasAllergenGroup(ingredients, "milk") &&
        !hasAllergenGroup(ingredients, "eggs") &&
        !containsHoney(ingredients)
      );
    },
  },
  {
    id: "gluten_free",
    label: "Gluten-free",
    basis: "No wheat, barley or rye ingredients",
    evaluate: ({ ingredients }) => {
      if (ingredients.length === 0) return null;
      return !hasAllergenGroup(ingredients, "wheat");
    },
  },
  {
    id: "dairy_free",
    label: "Dairy-free",
    basis: "No milk-derived ingredients",
    evaluate: ({ ingredients }) => {
      if (ingredients.length === 0) return null;
      return !hasAllergenGroup(ingredients, "milk");
    },
  },
  {
    id: "low_sugar",
    label: "Low sugar",
    basis: "5 g or less total sugar per serving",
    evaluate: ({ nutrition }) => {
      const sugar = num(nutrition?.sugar);
      if (sugar == null) return null;
      return sugar <= 5;
    },
  },
  {
    id: "high_protein",
    label: "High protein",
    basis: "At least 20% of energy from protein",
    evaluate: ({ nutrition }) => {
      const protein = num(nutrition?.protein);
      const calories = num(nutrition?.calories);
      if (protein == null || calories == null || calories <= 0) return null;
      return (protein * 4) / calories >= 0.2;
    },
  },
  {
    id: "low_sodium",
    label: "Low sodium",
    basis: "140 mg or less sodium per serving",
    evaluate: ({ nutrition }) => {
      const sodium = num(nutrition?.sodium);
      if (sodium == null) return null;
      return sodium <= 140;
    },
  },
];

const PREF_BY_ID = new Map(DIETARY_PREFERENCES.map((p) => [p.id, p]));
const PREF_BY_LABEL = new Map(
  DIETARY_PREFERENCES.map((p) => [p.label.toLowerCase(), p])
);

/** Resolve a user-entered preference string to a known preference, or null. */
function resolvePreference(value) {
  if (value == null) return null;
  const key = String(value).trim().toLowerCase();
  if (!key) return null;
  if (PREF_BY_ID.has(key)) return PREF_BY_ID.get(key);
  if (PREF_BY_LABEL.has(key)) return PREF_BY_LABEL.get(key);
  const normalised = key.replace(/[\s_]+/g, "-");
  for (const pref of DIETARY_PREFERENCES) {
    if (pref.label.toLowerCase().replace(/[\s_]+/g, "-") === normalised) return pref;
  }
  return null;
}

function resolveUserPreferences(preferences) {
  const list = Array.isArray(preferences) ? preferences : [];
  const resolved = [];
  const unrecognised = [];
  const seen = new Set();

  for (const entry of list) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const pref = resolvePreference(entry);
    if (!pref) {
      unrecognised.push(entry.trim());
      continue;
    }
    if (seen.has(pref.id)) continue;
    seen.add(pref.id);
    resolved.push(pref);
  }
  return { resolved, unrecognised };
}

/**
 * Evaluate every known preference for a recipe, then score the user's selected
 * preferences against it. Preferences that cannot be decided from stored data are
 * reported as unknown and never counted as satisfied.
 */
function evaluateRecipePreferences(recipe, userPreferences) {
  const ingredients = recipe?.recipe_ingredients || recipe?.ingredients || [];
  const nutrition = recipe?.nutrition || null;
  const context = { ingredients, nutrition };

  const satisfiedAll = [];
  for (const pref of DIETARY_PREFERENCES) {
    if (pref.evaluate(context) === true) {
      satisfiedAll.push({ id: pref.id, label: pref.label, basis: pref.basis });
    }
  }

  const { resolved, unrecognised } = resolveUserPreferences(userPreferences);
  const matched = [];
  const unmet = [];
  const unknown = [];

  for (const pref of resolved) {
    const result = pref.evaluate(context);
    const entry = { id: pref.id, label: pref.label, basis: pref.basis };
    if (result === true) matched.push(entry);
    else if (result === false) unmet.push(entry);
    else unknown.push(entry);
  }

  const decidable = matched.length + unmet.length;
  return {
    satisfiedAll,
    matched,
    unmet,
    unknown,
    unrecognisedPreferences: unrecognised,
    selectedCount: resolved.length,
    // Share of decidable selected preferences that the recipe satisfies.
    matchPercent: decidable > 0 ? Math.round((matched.length / decidable) * 100) : null,
  };
}

module.exports = {
  DIETARY_PREFERENCES,
  DIETARY_PREFERENCE_LABELS: DIETARY_PREFERENCES.map((p) => p.label),
  resolvePreference,
  resolveUserPreferences,
  evaluateRecipePreferences,
};
