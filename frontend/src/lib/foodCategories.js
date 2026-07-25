/** Approved Discovery Vitality food subcategories (canonical list). */
export const FOOD_CATEGORIES = [
  "Breads",
  "Chicken",
  "Cottage cheese",
  "Couscous",
  "Crackers",
  "Dried vegetables and herbs",
  "Eggs",
  "Fish and seafood",
  "Fruit, vegetables and herbs",
  "High fat, baked and fried items",
  "Legumes",
  "Maize",
  "Milk",
  "Nut butters",
  "Nuts and seeds",
  "Oils and sprays",
  "Ostrich and venison",
  "Pasta and noodles",
  "Snacks and condiments high in salt",
  "Soy products (tofu)",
  "Soya milk",
  "Sugary drinks",
  "Sugary foods",
  "Tinned fish and seafood",
  "Tinned vegetables",
  "Whole grains",
  "Yoghurt",
];

export const UNCATEGORISED = "Uncategorised";

export function normalizeFoodCategory(value) {
  if (value == null || String(value).trim() === "") return UNCATEGORISED;
  return String(value).trim();
}
