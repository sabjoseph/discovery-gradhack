const supabase = require("../config/supabase");
const { checkRecipeAllergens } = require("./allergenMatch");
const { evaluateRecipePreferences } = require("./dietaryPreferences");
const { buildSubstitutionPanel } = require("./substitutions");
const { classifyCategory } = require("./health");

const ALLERGEN_WARNING = "Contains an ingredient matching your allergy profile.";

/**
 * Load the personalisation inputs for a customer once, so routes do not each
 * refetch the profile.
 */
async function loadPersonalisationContext(customerId) {
  const empty = { allergies: [], preferences: [], healthGoals: [] };
  if (!customerId) return empty;

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("dietary_preferences, health_goals")
    .eq("id", customerId)
    .maybeSingle();

  if (error || !profile) return empty;

  const goalsRaw = Array.isArray(profile.health_goals) ? profile.health_goals : [];

  return {
    preferences: Array.isArray(profile.dietary_preferences)
      ? profile.dietary_preferences.filter((x) => typeof x === "string")
      : [],
    allergies: extractAllergies(goalsRaw),
    healthGoals: goalsRaw.filter((x) => typeof x === "string"),
  };
}

// Allergies live as a reserved object inside health_goals jsonb, matching the
// existing __metrics / __vouchers / __avatar convention in routes/profile.js.
function extractAllergies(healthGoals) {
  const list = Array.isArray(healthGoals) ? healthGoals : [];
  const entry = list.find(
    (item) => item && typeof item === "object" && item.__allergies
  );
  return Array.isArray(entry?.items)
    ? entry.items.filter((x) => typeof x === "string")
    : [];
}

function withAllergies(healthGoals, allergies) {
  const list = Array.isArray(healthGoals) ? [...healthGoals] : [];
  const filtered = list.filter(
    (item) => !(item && typeof item === "object" && item.__allergies)
  );
  const items = Array.isArray(allergies)
    ? allergies.filter((x) => typeof x === "string" && x.trim())
    : [];
  if (items.length > 0) {
    filtered.push({ __allergies: true, items });
  }
  return filtered;
}

/** Health-goal alignment from the recipe's ingredient health classifications. */
function healthGoalScore(recipe, healthGoals) {
  if (!Array.isArray(healthGoals) || healthGoals.length === 0) return null;
  const ingredients = recipe?.recipe_ingredients || recipe?.ingredients || [];
  if (ingredients.length === 0) return null;

  let healthy = 0;
  let counted = 0;
  for (const ing of ingredients) {
    const mainCategory = ing?.categories?.main_category ?? ing?.mainCategory ?? null;
    if (!mainCategory) continue;
    counted += 1;
    if (classifyCategory(mainCategory) === "healthy") healthy += 1;
  }
  if (counted === 0) return null;
  return Math.round((healthy / counted) * 100);
}

/**
 * Annotate one recipe with allergen safety, preference badges and (when unsafe)
 * verified alternatives.
 *
 * Safety is independent of ranking: an allergen hit can never be offset by a high
 * pantry match.
 */
function annotateRecipe(recipe, context, { includeSubstitutions = false } = {}) {
  const { allergies = [], preferences = [], healthGoals = [] } = context || {};
  const ingredients = recipe?.recipe_ingredients || recipe?.ingredients || [];

  const allergenReport = checkRecipeAllergens(ingredients, allergies);
  const preferenceReport = evaluateRecipePreferences(recipe, preferences);
  const goalScore = healthGoalScore(recipe, healthGoals);

  const annotation = {
    isSafe: !allergenReport.hasAllergen,
    allergen: {
      hasAllergen: allergenReport.hasAllergen,
      warning: allergenReport.hasAllergen ? ALLERGEN_WARNING : null,
      labels: allergenReport.allergenLabels,
      matches: allergenReport.matches.map((m) => ({
        ingredientName: m.ingredientName,
        allergenLabel: m.allergenLabel,
        quantity: m.quantity,
        unit: m.unit,
      })),
      needsReview: allergenReport.needsReview,
      unrecognisedAllergies: allergenReport.unrecognisedAllergies,
    },
    preferences: {
      badges: preferenceReport.satisfiedAll.map((p) => p.label),
      matched: preferenceReport.matched,
      unmet: preferenceReport.unmet,
      unknown: preferenceReport.unknown,
      matchPercent: preferenceReport.matchPercent,
      selectedCount: preferenceReport.selectedCount,
    },
    healthGoalScore: goalScore,
  };

  if (includeSubstitutions && allergenReport.hasAllergen) {
    annotation.substitutions = buildSubstitutionPanel(allergenReport.matches, {
      allergies,
      preferences,
    });
  }

  return annotation;
}

/**
 * Combined personalisation score.
 *
 * Pantry match is preserved as the base signal; preference and health-goal
 * alignment are added as further factors rather than replacing it.
 */
function personalisedScore({ pantryMatchPercent, preferenceMatchPercent, healthGoalScore: goal }) {
  const pantry = Number.isFinite(pantryMatchPercent) ? pantryMatchPercent : 0;

  let total = pantry * 0.55;
  let weightUsed = 0.55;

  if (preferenceMatchPercent != null) {
    total += preferenceMatchPercent * 0.3;
    weightUsed += 0.3;
  }
  if (goal != null) {
    total += goal * 0.15;
    weightUsed += 0.15;
  }

  // Rescale so recipes are comparable when a signal is unavailable.
  return Math.round(total / weightUsed);
}

/**
 * Sort so that allergen-free recipes always outrank recipes containing a saved
 * allergen, regardless of score.
 */
function compareBySafetyThenScore(a, b) {
  const aSafe = a.isSafe !== false;
  const bSafe = b.isSafe !== false;
  if (aSafe !== bSafe) return aSafe ? -1 : 1;
  return (b.personalScore ?? 0) - (a.personalScore ?? 0);
}

module.exports = {
  ALLERGEN_WARNING,
  loadPersonalisationContext,
  extractAllergies,
  withAllergies,
  annotateRecipe,
  personalisedScore,
  compareBySafetyThenScore,
  healthGoalScore,
};
