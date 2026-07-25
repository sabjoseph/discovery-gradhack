const { INGREDIENT_SUBSTITUTIONS } = require("../data/ingredientSubstitutions");
const { resolveUserAllergies } = require("./allergenMatch");
const { resolveUserPreferences } = require("./dietaryPreferences");

const NO_ALTERNATIVE_MESSAGE =
  "No verified alternative is currently available for this ingredient.";

const SUBSTITUTION_NOTICE =
  "Ingredient substitutions are suggestions only. Always check product labels and seek professional advice for severe allergies.";

// Preferences that rule out whole substitute groups.
const PREFERENCE_BLOCKS = {
  vegan: ["milk", "eggs"],
  plant_based: ["milk", "eggs"],
  dairy_free: ["milk"],
  gluten_free: ["wheat"],
};

function matchesIngredient(row, ingredientName) {
  const raw = String(ingredientName || "").toLowerCase();
  if (!raw.trim()) return false;
  return row.matches.some((term) =>
    new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(raw)
  );
}

function percentDelta(from, to) {
  if (from == null || to == null) return null;
  if (Number(from) === 0) return to === 0 ? 0 : null;
  return Math.round(((to - from) / from) * 100);
}

const COMPARE_FIELDS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbohydrates_g", label: "Carbohydrates", unit: "g" },
  { key: "fat_g", label: "Total fat", unit: "g" },
  { key: "fibre_g", label: "Fibre", unit: "g" },
];

/** Approximate comparison. Never asserts equivalence beyond the tolerance used. */
function buildComparison(row) {
  const rows = COMPARE_FIELDS.map((field) => {
    const original = row.originalNutrition?.[field.key] ?? null;
    const substitute = row.nutrition?.[field.key] ?? null;
    return {
      label: field.label,
      unit: field.unit,
      original,
      substitute,
      deltaPercent: percentDelta(original, substitute),
      available: original != null && substitute != null,
    };
  });

  const calorieDelta = rows.find((r) => r.label === "Calories")?.deltaPercent;
  const proteinDelta = rows.find((r) => r.label === "Protein")?.deltaPercent;

  // Tolerance: within 25% energy and 30% protein is treated as broadly comparable.
  const broadlyComparable =
    calorieDelta != null &&
    proteinDelta != null &&
    Math.abs(calorieDelta) <= 25 &&
    Math.abs(proteinDelta) <= 30;

  return {
    basis: row.basis,
    rows,
    broadlyComparable,
    summary: broadlyComparable
      ? "Broadly comparable on energy and protein (approximate)."
      : "Nutritionally different from the original — review before using.",
  };
}

function scaleQuantity(quantity, ratio) {
  const n = Number(quantity);
  if (!Number.isFinite(n) || ratio == null) return null;
  const scaled = n * Number(ratio);
  return Math.round(scaled * 100) / 100;
}

/**
 * Find verified alternatives for one allergenic ingredient.
 *
 * Excludes any substitute containing another of the user's allergies, and any
 * substitute ruled out by the user's dietary preferences.
 */
function findSubstitutions(match, { allergies = [], preferences = [] } = {}) {
  const { resolved: userAllergens } = resolveUserAllergies(allergies);
  const blockedByAllergy = new Set(userAllergens.map((a) => a.id));

  const { resolved: userPrefs } = resolveUserPreferences(preferences);
  const blockedByPreference = new Set();
  for (const pref of userPrefs) {
    for (const allergenId of PREFERENCE_BLOCKS[pref.id] || []) {
      blockedByPreference.add(allergenId);
    }
  }

  const options = INGREDIENT_SUBSTITUTIONS.filter((row) => {
    if (!row.verified) return false;
    if (!row.replacesAllergens.includes(match.allergenId)) return false;
    if (!matchesIngredient(row, match.ingredientName)) return false;

    // Never suggest something the user is allergic to.
    if (row.containsAllergens.some((id) => blockedByAllergy.has(id))) return false;
    // Respect dietary preferences when choosing alternatives.
    if (row.containsAllergens.some((id) => blockedByPreference.has(id))) return false;

    return true;
  }).map((row) => ({
    id: row.id,
    originalIngredient: match.ingredientName,
    substitute: row.substitute,
    cookingContext: row.cookingContext,
    quantityRatio: row.quantityRatio,
    adjustedQuantity: scaleQuantity(match.quantity, row.quantityRatio),
    originalQuantity: match.quantity ?? null,
    unit: match.unit ?? null,
    comparison: buildComparison(row),
    caveat: row.caveat || null,
    source: row.source,
  }));

  return options;
}

/** Build the alternatives payload for every allergen hit in a recipe. */
function buildSubstitutionPanel(allergenMatches, { allergies, preferences }) {
  const groups = (allergenMatches || []).map((match) => {
    const options = findSubstitutions(match, { allergies, preferences });
    return {
      ingredientName: match.ingredientName,
      allergenLabel: match.allergenLabel,
      quantity: match.quantity ?? null,
      unit: match.unit ?? null,
      options,
      message: options.length === 0 ? NO_ALTERNATIVE_MESSAGE : null,
    };
  });

  return {
    groups,
    hasAnyOption: groups.some((g) => g.options.length > 0),
    notice: SUBSTITUTION_NOTICE,
  };
}

module.exports = {
  findSubstitutions,
  buildSubstitutionPanel,
  NO_ALTERNATIVE_MESSAGE,
  SUBSTITUTION_NOTICE,
};
