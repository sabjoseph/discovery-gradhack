export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 20;

/**
 * Clamp desired servings to the allowed range.
 */
export function clampServings(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MIN_SERVINGS;
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(n)));
}

/**
 * Scale factor: desired ÷ original. Never divides by zero.
 */
export function servingsScale(desiredServings, originalServings) {
  const original = Math.max(1, Number(originalServings) || 1);
  const desired = clampServings(desiredServings);
  return desired / original;
}

/**
 * Returns true when the quantity can be treated as a number for scaling.
 * Nonnumeric values like "to taste", "as needed", "one pinch" are left alone.
 */
export function isNumericQuantity(quantity) {
  if (quantity == null || quantity === "") return false;
  if (typeof quantity === "number") return Number.isFinite(quantity);
  const trimmed = String(quantity).trim();
  if (!trimmed) return false;
  // Pure numeric / decimal only — reject phrases with letters
  if (/[a-zA-Z]/.test(trimmed)) return false;
  const n = Number(trimmed);
  return Number.isFinite(n);
}

/**
 * Round scaled amounts to at most two decimal places and trim trailing zeros.
 */
export function formatScaledNumber(value) {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

/**
 * adjusted = original × desired ÷ originalServings
 * Returns a display string; units are preserved by the caller.
 * Nonnumeric quantities are returned unchanged (as string).
 */
export function scaleIngredientQuantity(
  originalQuantity,
  desiredServings,
  originalServings
) {
  if (!isNumericQuantity(originalQuantity)) {
    if (originalQuantity == null || originalQuantity === "") return null;
    return String(originalQuantity);
  }

  const original = Number(originalQuantity);
  const scale = servingsScale(desiredServings, originalServings);
  return formatScaledNumber(original * scale);
}

/**
 * Build "name — qty unit" without mutating the ingredient object.
 */
export function formatScaledIngredient(
  ingredient,
  desiredServings,
  originalServings
) {
  const name = ingredient?.name || "Ingredient";
  const scaledQty = scaleIngredientQuantity(
    ingredient?.quantity,
    desiredServings,
    originalServings
  );
  const unit = ingredient?.unit ? String(ingredient.unit).trim() : "";

  if (scaledQty == null || scaledQty === "") {
    return name;
  }

  const amount = unit ? `${scaledQty} ${unit}` : scaledQty;
  return `${name} — ${amount}`;
}

/**
 * Scale a numeric nutrition value with the same desired-servings state.
 * Returns null when the value is missing or nonnumeric.
 */
export function scaleNutritionValue(
  value,
  desiredServings,
  originalServings
) {
  if (!isNumericQuantity(value)) return null;
  const scale = servingsScale(desiredServings, originalServings);
  return formatScaledNumber(Number(value) * scale);
}

/**
 * Message shown when the user changes servings from the recipe default.
 */
export function servingsAdjustmentMessage(desiredServings, originalServings) {
  const original = Math.max(1, Number(originalServings) || 1);
  const desired = clampServings(desiredServings);
  if (desired === original) return "";
  return `Measurements adjusted from ${original} to ${desired} servings.`;
}
