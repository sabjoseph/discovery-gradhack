require("dotenv").config({ quiet: true });

const test = require("node:test");
const assert = require("node:assert/strict");

const { checkRecipeAllergens } = require("../src/utils/allergenMatch");
const {
  evaluateRecipePreferences,
} = require("../src/utils/dietaryPreferences");
const { buildSubstitutionPanel } = require("../src/utils/substitutions");
const {
  annotateRecipe,
  personalisedScore,
  compareBySafetyThenScore,
  extractAllergies,
  withAllergies,
} = require("../src/utils/recipePersonalisation");

function ing(name, extra = {}) {
  return {
    id: name,
    ingredient_name: name,
    category_id: 1,
    quantity_required: 1,
    unit: "cup",
    categories: { id: 1, main_category: "Vegetables", subcategory: "Fruit, vegetables and herbs" },
    ...extra,
  };
}

test("matches an allergen regardless of case and surrounding words", () => {
  const result = checkRecipeAllergens([ing("Fat Free Plain YOGHURT")], ["Milk"]);
  assert.equal(result.hasAllergen, true);
  assert.deepEqual(result.allergenLabels, ["Milk"]);
});

test("matches allergens listed by alias", () => {
  assert.equal(
    checkRecipeAllergens([ing("fat free milk")], ["dairy"]).hasAllergen,
    true
  );
  assert.equal(
    checkRecipeAllergens([ing("bulgur wheat, raw")], ["gluten"]).hasAllergen,
    true
  );
});

test("does not raise false positives on look-alike ingredient names", () => {
  const cases = [
    ["soya milk", "Milk"],
    ["peanut butter", "Milk"],
    ["sunflower seed butter", "Milk"],
    ["coconut milk", "Milk"],
    ["eggplant", "Eggs"],
    ["buckwheat flour", "Wheat"],
    ["shellfish stock", "Fish"],
    ["nutmeg", "Tree nuts"],
    ["water chestnut", "Tree nuts"],
    ["rice noodles", "Wheat"],
  ];
  for (const [name, allergy] of cases) {
    assert.equal(
      checkRecipeAllergens([ing(name)], [allergy]).hasAllergen,
      false,
      `"${name}" must not be flagged as ${allergy}`
    );
  }
});

test("still flags the allergen the look-alike name really belongs to", () => {
  assert.equal(checkRecipeAllergens([ing("soya milk")], ["Soy"]).hasAllergen, true);
  assert.equal(
    checkRecipeAllergens([ing("peanut butter")], ["Peanuts"]).hasAllergen,
    true
  );
  assert.equal(
    checkRecipeAllergens([ing("shellfish stock")], ["Shellfish"]).hasAllergen,
    true
  );
});

test("strips exclusions without hiding a genuine match elsewhere in the name", () => {
  const result = checkRecipeAllergens(
    [ing("milk and peanut butter sauce")],
    ["Milk"]
  );
  assert.equal(result.hasAllergen, true);
});

test("reports unclassifiable ingredients for review instead of assuming safe", () => {
  const result = checkRecipeAllergens(
    [ing("mystery house blend", { category_id: null, categories: null })],
    ["Peanuts"]
  );
  assert.equal(result.hasAllergen, false);
  assert.equal(result.needsReview.length, 1);
  assert.equal(result.needsReview[0].ingredientName, "mystery house blend");
});

test("reports allergies it cannot check rather than silently ignoring them", () => {
  const result = checkRecipeAllergens([ing("tomato")], ["Nightshades"]);
  assert.deepEqual(result.unrecognisedAllergies, ["Nightshades"]);
});

test("no allergies saved means no allergen checks and no review noise", () => {
  const result = checkRecipeAllergens([ing("fat free milk")], []);
  assert.equal(result.hasAllergen, false);
  assert.equal(result.needsReview.length, 0);
});

test("derives dietary preference badges from ingredients, not the recipe title", () => {
  const vegan = evaluateRecipePreferences(
    { recipe_ingredients: [ing("chickpeas"), ing("olive oil")], nutrition: null },
    []
  );
  const labels = vegan.satisfiedAll.map((p) => p.label);
  assert.ok(labels.includes("Vegetarian"));
  assert.ok(labels.includes("Vegan"));
  assert.ok(labels.includes("Dairy-free"));

  // A "Vegetarian Mexican Fiesta" containing chicken broth is not vegetarian.
  const notVeg = evaluateRecipePreferences(
    {
      recipe_ingredients: [ing("chicken broth"), ing("black beans")],
      nutrition: null,
    },
    ["Vegetarian"]
  );
  assert.equal(notVeg.matched.length, 0);
  assert.equal(notVeg.unmet[0].label, "Vegetarian");
});

test("nutrition-based preferences use stored values and stay unknown when missing", () => {
  const withData = evaluateRecipePreferences(
    { recipe_ingredients: [ing("lentils")], nutrition: { calories: 200, protein: 12, sugar: 3 } },
    ["High protein", "Low sugar"]
  );
  assert.equal(withData.matched.length, 2);

  const withoutData = evaluateRecipePreferences(
    { recipe_ingredients: [ing("lentils")], nutrition: null },
    ["High protein"]
  );
  assert.equal(withoutData.unknown.length, 1);
  assert.equal(withoutData.matchPercent, null);
});

test("never offers a substitute containing another of the user's allergies", () => {
  const matches = checkRecipeAllergens(
    [ing("fat free plain yoghurt")],
    ["Milk"]
  ).matches;

  const milkOnly = buildSubstitutionPanel(matches, {
    allergies: ["Milk"],
    preferences: [],
  });
  assert.ok(
    milkOnly.groups[0].options.some((o) => o.substitute.includes("soy")),
    "soy yoghurt should be offered when only milk is an allergy"
  );

  const milkAndSoy = buildSubstitutionPanel(matches, {
    allergies: ["Milk", "Soy"],
    preferences: [],
  });
  assert.ok(
    milkAndSoy.groups[0].options.every((o) => !o.substitute.includes("soy")),
    "soy yoghurt must be withheld from someone allergic to soy"
  );
});

test("respects dietary preferences when choosing an alternative", () => {
  const matches = checkRecipeAllergens([ing("plain tofu, crumbled")], ["Soy"]).matches;
  const vegan = buildSubstitutionPanel(matches, {
    allergies: ["Soy"],
    preferences: ["Vegan"],
  });
  // The only verified tofu alternative is dairy yoghurt, which a vegan cannot use.
  assert.equal(vegan.groups[0].options.length, 0);
  assert.match(vegan.groups[0].message, /No verified alternative/);
});

test("states plainly when no verified alternative exists", () => {
  const matches = checkRecipeAllergens([ing("hake fillet")], ["Fish"]).matches;
  const panel = buildSubstitutionPanel(matches, {
    allergies: ["Fish"],
    preferences: [],
  });
  assert.equal(panel.hasAnyOption, false);
  assert.match(panel.groups[0].message, /No verified alternative/);
});

test("substitution comparison labels a poor nutritional match honestly", () => {
  const matches = checkRecipeAllergens([ing("fat free plain yoghurt")], ["Milk"]).matches;
  const panel = buildSubstitutionPanel(matches, { allergies: ["Milk"], preferences: [] });
  const coconut = panel.groups[0].options.find((o) =>
    o.substitute.includes("coconut")
  );
  assert.equal(coconut.comparison.broadlyComparable, false);
  assert.match(coconut.comparison.summary, /Nutritionally different/);
});

test("a high pantry match can never make an allergen recipe outrank a safe one", () => {
  const context = { allergies: ["Milk"], preferences: [], healthGoals: [] };

  const unsafe = annotateRecipe(
    { recipe_ingredients: [ing("fat free milk")], nutrition: null },
    context
  );
  const safe = annotateRecipe(
    { recipe_ingredients: [ing("tomato")], nutrition: null },
    context
  );

  assert.equal(unsafe.isSafe, false);
  assert.equal(safe.isSafe, true);

  const ranked = [
    { name: "unsafe", isSafe: unsafe.isSafe, personalScore: 100 },
    { name: "safe", isSafe: safe.isSafe, personalScore: 5 },
  ].sort(compareBySafetyThenScore);

  assert.equal(ranked[0].name, "safe");
});

test("preference alignment raises a recipe's score", () => {
  const base = { pantryMatchPercent: 60, healthGoalScore: null };
  const aligned = personalisedScore({ ...base, preferenceMatchPercent: 100 });
  const misaligned = personalisedScore({ ...base, preferenceMatchPercent: 0 });
  assert.ok(aligned > misaligned);
});

test("allergies round-trip through health_goals without disturbing other entries", () => {
  const goals = [
    "Eat healthier",
    { __metrics: true, age: 30 },
    { __vouchers: true, items: [{ id: "v1" }] },
  ];
  const merged = withAllergies(goals, ["Peanuts", "Milk"]);

  assert.deepEqual(extractAllergies(merged), ["Peanuts", "Milk"]);
  assert.ok(merged.includes("Eat healthier"));
  assert.ok(merged.some((g) => g && g.__metrics));
  assert.ok(merged.some((g) => g && g.__vouchers));

  // Replacing the list must not accumulate duplicate reserved objects.
  const replaced = withAllergies(merged, ["Soy"]);
  assert.deepEqual(extractAllergies(replaced), ["Soy"]);
  assert.equal(replaced.filter((g) => g && g.__allergies).length, 1);

  assert.deepEqual(extractAllergies(withAllergies(merged, [])), []);
});
