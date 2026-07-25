import { clampServings } from "./scaleServings";

/** Canonical per-serving nutrition keys used by the recipe detail calculator. */
export const NUTRITION_FIELDS = [
  { key: "calories", label: "Calories", kind: "calories", unit: "kcal" },
  { key: "protein", label: "Protein", kind: "macro", unit: "g" },
  { key: "carbohydrates", label: "Carbohydrates", kind: "macro", unit: "g" },
  { key: "sugar", label: "Sugar", kind: "macro", unit: "g" },
  { key: "totalFat", label: "Total fat", kind: "macro", unit: "g" },
  { key: "saturatedFat", label: "Saturated fat", kind: "macro", unit: "g", optional: true },
  { key: "fibre", label: "Fibre", kind: "macro", unit: "g", optional: true },
  { key: "sodium", label: "Sodium", kind: "sodium", unit: null, optional: true },
];

function toNumberOrNull(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise verified recipe nutrition into a per-serving object.
 * Missing fields stay null — never coerced to 0.
 * Accepts nested `nutrition` or flat recipe fields.
 */
export function getPerServingNutrition(recipe) {
  if (!recipe || typeof recipe !== "object") return null;

  const src =
    recipe.nutrition && typeof recipe.nutrition === "object"
      ? recipe.nutrition
      : recipe;

  const perServing = {
    calories: toNumberOrNull(
      src.calories ?? src.caloriesPerServing ?? src.calories_per_serving
    ),
    protein: toNumberOrNull(
      src.protein ?? src.proteinG ?? src.protein_g ?? src.proteinPerServing
    ),
    carbohydrates: toNumberOrNull(
      src.carbohydrates ??
        src.carbs ??
        src.carbohydratesG ??
        src.carbohydrates_g ??
        src.carbsPerServing
    ),
    sugar: toNumberOrNull(src.sugar ?? src.sugarG ?? src.sugar_g),
    totalFat: toNumberOrNull(
      src.totalFat ?? src.total_fat ?? src.fat ?? src.fatG ?? src.fat_g
    ),
    saturatedFat: toNumberOrNull(
      src.saturatedFat ?? src.saturated_fat ?? src.satFat ?? src.sat_fat
    ),
    fibre: toNumberOrNull(
      src.fibre ?? src.fiber ?? src.fibreG ?? src.fiber_g ?? src.fibre_g
    ),
    sodium: toNumberOrNull(src.sodium ?? src.sodiumMg ?? src.sodium_mg),
    sodiumUnit:
      src.sodiumUnit ||
      src.sodium_unit ||
      (src.sodium != null || src.sodiumMg != null || src.sodium_mg != null
        ? "mg"
        : null),
  };

  const hasAny = NUTRITION_FIELDS.some(({ key }) => perServing[key] != null);
  return hasAny ? perServing : null;
}

/** Calories → nearest whole number. Missing → null. */
export function roundCalories(value) {
  const n = toNumberOrNull(value);
  if (n == null) return null;
  return Math.round(n);
}

/** Macros → one decimal place. Missing → null. */
export function roundMacro(value) {
  const n = toNumberOrNull(value);
  if (n == null) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Total for desired servings from unchanged per-serving verified values.
 * total = perServing × desiredServings
 */
export function totalNutritionForServings(perServing, desiredServings) {
  if (!perServing) return null;
  const servings = clampServings(desiredServings);
  const scale = (value) => {
    const n = toNumberOrNull(value);
    return n == null ? null : n * servings;
  };

  return {
    calories: scale(perServing.calories),
    protein: scale(perServing.protein),
    carbohydrates: scale(perServing.carbohydrates),
    sugar: scale(perServing.sugar),
    totalFat: scale(perServing.totalFat),
    saturatedFat: scale(perServing.saturatedFat),
    fibre: scale(perServing.fibre),
    sodium: scale(perServing.sodium),
    sodiumUnit: perServing.sodiumUnit,
    servings,
  };
}

function formatDisplayValue(field, value, sodiumUnit) {
  if (value == null) return "Not available";

  if (field.kind === "calories") {
    return `${roundCalories(value)} ${field.unit}`;
  }

  if (field.kind === "sodium") {
    const rounded = roundMacro(value);
    const unit = sodiumUnit || field.unit || "mg";
    return `${rounded} ${unit}`;
  }

  // macro
  const rounded = roundMacro(value);
  return `${rounded} ${field.unit}`;
}

/**
 * Build labelled rows for Per serving + Total for N servings panels.
 * Per-serving verified values are never mutated.
 */
export function buildNutritionPanels(recipe, desiredServings) {
  const perServing = getPerServingNutrition(recipe);
  const servings = clampServings(desiredServings);
  const total = totalNutritionForServings(perServing, servings);

  const rowsFor = (source) =>
    NUTRITION_FIELDS.map((field) => ({
      key: field.key,
      label: field.label,
      optional: Boolean(field.optional),
      display: formatDisplayValue(
        field,
        source ? source[field.key] : null,
        source?.sodiumUnit ?? perServing?.sodiumUnit
      ),
      available: source ? source[field.key] != null : false,
    }));

  return {
    hasVerifiedData: perServing != null,
    perServingLabel: "Per serving",
    totalLabel: `Total for ${servings} serving${servings === 1 ? "" : "s"}`,
    perServingRows: rowsFor(perServing),
    totalRows: rowsFor(total),
    disclaimer:
      "Nutritional values are estimates and may vary according to ingredients and portion sizes.",
  };
}
