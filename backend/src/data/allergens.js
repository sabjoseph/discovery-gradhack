/**
 * Canonical food allergens and their ingredient aliases.
 *
 * `aliases` are matched on word boundaries against a lowercased ingredient name.
 * `excludes` are removed from the ingredient name *before* aliases are tested, so
 * compound names that only look like an allergen cannot raise a false positive
 * (for example "soya milk" must not flag Milk, and "peanut butter" must not flag Milk).
 *
 * Only widely recognised regulatory allergen groups are listed. Ingredients that
 * match nothing here are never assumed safe — see `needsReview` in allergenMatch.js.
 */
const ALLERGENS = [
  {
    id: "peanuts",
    label: "Peanuts",
    aliases: ["peanut", "peanuts", "peanut butter", "groundnut", "groundnuts", "monkey nut", "arachis"],
    excludes: [],
  },
  {
    id: "tree_nuts",
    label: "Tree nuts",
    // Coconut is included because US FDA regulates it as a tree nut.
    aliases: [
      "tree nut", "tree nuts", "almond", "almonds", "cashew", "cashews",
      "walnut", "walnuts", "pecan", "pecans", "pistachio", "pistachios",
      "hazelnut", "hazelnuts", "macadamia", "brazil nut", "brazil nuts",
      "pine nut", "pine nuts", "praline", "marzipan", "nut butter", "coconut",
    ],
    excludes: ["nutmeg", "water chestnut", "peanut", "groundnut", "nutritional yeast"],
  },
  {
    id: "milk",
    label: "Milk",
    aliases: [
      "milk", "buttermilk", "cream", "creme fraiche", "yoghurt", "yogurt",
      "cheese", "butter", "ghee", "whey", "casein", "caseinate", "custard",
      "condensed milk", "evaporated milk", "milk powder",
    ],
    excludes: [
      "soy milk", "soya milk", "almond milk", "oat milk", "rice milk",
      "coconut milk", "coconut cream", "cashew milk", "hemp milk", "pea milk",
      "peanut butter", "nut butter", "seed butter", "sunflower seed butter",
      "cocoa butter", "shea butter", "milk thistle", "dairy-free", "dairy free",
      "soy yoghurt", "soya yoghurt", "coconut yoghurt", "vegan cheese",
    ],
  },
  {
    id: "eggs",
    label: "Eggs",
    aliases: ["egg", "eggs", "egg white", "egg yolk", "albumen", "albumin", "mayonnaise", "meringue"],
    excludes: ["eggplant", "egg-free", "egg free", "eggless"],
  },
  {
    id: "wheat",
    label: "Wheat",
    aliases: [
      "wheat", "wholewheat", "whole wheat", "bulgur", "bulgar", "couscous",
      "semolina", "durum", "spelt", "farro", "seitan", "bread", "breadcrumb",
      "breadcrumbs", "flour", "pasta", "noodle", "noodles", "pita", "roti", "barley", "rye",
    ],
    excludes: [
      "buckwheat", "gluten-free", "gluten free", "gluten-free breadcrumbs",
      // Non-wheat flours, listed explicitly so the generic "flour" alias cannot
      // flag them. Exclusions are applied longest-first.
      "buckwheat flour", "rice flour", "almond flour", "chickpea flour",
      "gram flour", "corn flour", "cornflour", "maize flour", "coconut flour",
      "oat flour", "potato flour", "cassava flour", "tapioca flour",
      "sorghum flour", "teff flour", "soy flour", "soya flour",
      "rice noodle", "rice noodles", "glass noodle", "glass noodles",
      "rice pasta", "corn pasta",
    ],
  },
  {
    id: "soy",
    label: "Soy",
    aliases: ["soy", "soya", "soybean", "soybeans", "tofu", "edamame", "miso", "tempeh", "tamari", "soy sauce"],
    excludes: [],
  },
  {
    id: "fish",
    label: "Fish",
    aliases: [
      "fish", "salmon", "tuna", "cod", "hake", "haddock", "anchovy", "anchovies",
      "sardine", "sardines", "mackerel", "trout", "snoek", "kingklip", "fish sauce",
    ],
    // "shellfish" and "cuttlefish" contain "fish" but belong to the shellfish group.
    excludes: ["shellfish", "cuttlefish", "fish-free"],
  },
  {
    id: "shellfish",
    label: "Shellfish",
    aliases: [
      "shellfish", "prawn", "prawns", "shrimp", "crab", "lobster", "crayfish",
      "mussel", "mussels", "oyster", "oysters", "clam", "clams", "scallop",
      "scallops", "squid", "calamari", "cuttlefish", "langoustine",
    ],
    excludes: [],
  },
  {
    id: "sesame",
    label: "Sesame",
    aliases: ["sesame", "tahini", "benne", "sesame oil", "sesame seed", "sesame seeds"],
    excludes: [],
  },
];

const ALLERGEN_BY_ID = new Map(ALLERGENS.map((a) => [a.id, a]));
const ALLERGEN_BY_LABEL = new Map(
  ALLERGENS.map((a) => [a.label.toLowerCase(), a])
);

/** Resolve a user-entered allergy string to a canonical allergen, or null when unknown. */
function resolveAllergen(value) {
  if (value == null) return null;
  const key = String(value).trim().toLowerCase();
  if (!key) return null;
  if (ALLERGEN_BY_ID.has(key)) return ALLERGEN_BY_ID.get(key);
  if (ALLERGEN_BY_LABEL.has(key)) return ALLERGEN_BY_LABEL.get(key);
  // Allow singular/plural and alias entry, e.g. "dairy" or "nuts"
  for (const allergen of ALLERGENS) {
    if (allergen.aliases.includes(key)) return allergen;
  }
  if (key === "dairy") return ALLERGEN_BY_ID.get("milk");
  if (key === "gluten") return ALLERGEN_BY_ID.get("wheat");
  return null;
}

module.exports = {
  ALLERGENS,
  ALLERGEN_LABELS: ALLERGENS.map((a) => a.label),
  resolveAllergen,
};
