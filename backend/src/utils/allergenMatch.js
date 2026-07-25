const { ALLERGENS, resolveAllergen } = require("../data/allergens");

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CACHE = new Map();

function patternsFor(allergen) {
  if (CACHE.has(allergen.id)) return CACHE.get(allergen.id);
  const build = (list) =>
    list.map((term) => new RegExp(`\\b${escapeRegex(term)}\\b`, "gi"));
  const compiled = {
    aliases: build(allergen.aliases),
    // Longest exclusion first, so a compound phrase is removed whole rather than
    // leaving a fragment that matches an alias ("buckwheat flour" -> " flour").
    excludes: build([...allergen.excludes].sort((a, b) => b.length - a.length)),
  };
  CACHE.set(allergen.id, compiled);
  return compiled;
}

/**
 * Does one ingredient name contain a given allergen?
 * Exclusions are stripped first so compound names ("soya milk", "peanut butter")
 * cannot raise a false positive for a different allergen.
 */
function ingredientMatchesAllergen(ingredientName, allergen) {
  const raw = String(ingredientName || "").toLowerCase();
  if (!raw.trim()) return null;

  const { aliases, excludes } = patternsFor(allergen);

  let working = raw;
  for (const pattern of excludes) {
    pattern.lastIndex = 0;
    working = working.replace(pattern, " ");
  }

  for (const pattern of aliases) {
    pattern.lastIndex = 0;
    const found = pattern.exec(working);
    if (found) {
      return { allergenId: allergen.id, label: allergen.label, matchedTerm: found[0] };
    }
  }
  return null;
}

/** Normalise a saved allergy list into canonical allergens plus unrecognised entries. */
function resolveUserAllergies(allergies) {
  const list = Array.isArray(allergies) ? allergies : [];
  const resolved = [];
  const unrecognised = [];
  const seen = new Set();

  for (const entry of list) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const allergen = resolveAllergen(entry);
    if (!allergen) {
      unrecognised.push(entry.trim());
      continue;
    }
    if (seen.has(allergen.id)) continue;
    seen.add(allergen.id);
    resolved.push(allergen);
  }

  return { resolved, unrecognised };
}

/**
 * Check a recipe's ingredient list against a user's saved allergies.
 *
 * Returns matched ingredients, the allergens involved, and any ingredients that
 * could not be classified confidently. Unclassified ingredients are reported for
 * review rather than being treated as safe.
 */
function checkRecipeAllergens(ingredients, allergies) {
  const { resolved, unrecognised } = resolveUserAllergies(allergies);
  const rows = Array.isArray(ingredients) ? ingredients : [];

  const matches = [];
  const allergenLabels = new Set();

  if (resolved.length > 0) {
    for (const ing of rows) {
      const name = ing?.ingredient_name ?? ing?.name ?? "";
      for (const allergen of resolved) {
        const hit = ingredientMatchesAllergen(name, allergen);
        if (hit) {
          matches.push({
            ingredientId: ing?.id ?? null,
            ingredientName: name,
            quantity: ing?.quantity_required ?? ing?.quantity ?? null,
            unit: ing?.unit ?? null,
            allergenId: hit.allergenId,
            allergenLabel: hit.label,
            matchedTerm: hit.matchedTerm,
          });
          allergenLabels.add(hit.label);
        }
      }
    }
  }

  // Ingredients we cannot confidently classify: no category on record and no
  // allergen match. Flagged for review instead of being declared safe.
  const matchedIds = new Set(matches.map((m) => m.ingredientId));
  const needsReview = [];
  if (resolved.length > 0 || unrecognised.length > 0) {
    for (const ing of rows) {
      const id = ing?.id ?? null;
      if (matchedIds.has(id)) continue;
      const hasCategory =
        (ing?.category_id ?? ing?.categoryId ?? null) != null;
      const name = ing?.ingredient_name ?? ing?.name ?? "";
      if (!hasCategory && String(name).trim()) {
        needsReview.push({ ingredientId: id, ingredientName: name });
      }
    }
  }

  return {
    hasAllergen: matches.length > 0,
    matches,
    allergenLabels: [...allergenLabels],
    needsReview,
    unrecognisedAllergies: unrecognised,
  };
}

module.exports = {
  ALLERGENS,
  ingredientMatchesAllergen,
  resolveUserAllergies,
  checkRecipeAllergens,
};
