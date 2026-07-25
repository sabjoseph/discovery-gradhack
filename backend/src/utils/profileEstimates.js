const supabase = require("../config/supabase");
const { classifyFromLabel } = require("./health");

// Below this much history, "never bought from category X" is noise rather than signal.
const MIN_BASKETS_FOR_CATEGORY_SIGNAL = 5;
const BUDGET_STEP = 50;
const PAGE_SIZE = 500;

const BASKET_SELECT = `
  id,
  purchase_date,
  basket_items (
    line_total,
    products (
      category_id,
      categories (
        id,
        main_category,
        subcategory,
        health_classifications ( classification )
      )
    )
  )
`;

async function fetchAllBaskets(customerId) {
  const baskets = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("baskets")
      .select(BASKET_SELECT)
      .eq("customer_id", customerId)
      .order("purchase_date", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    baskets.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return baskets;
}

function classificationFromItem(item) {
  const nested = item.products?.categories?.health_classifications;
  const label = Array.isArray(nested)
    ? nested[0]?.classification
    : nested?.classification;
  if (label) return classifyFromLabel(label);
  return classifyFromLabel(null, item.products?.categories?.main_category);
}

function categoryLabel(category) {
  return category?.subcategory || category?.main_category || null;
}

// Largest-remainder rounding so the three percentages always add up to 100.
function percentageMix(counts, total) {
  if (!total) return null;
  const entries = Object.keys(counts).map((key) => {
    const exact = (counts[key] / total) * 100;
    return { key, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let leftover = 100 - entries.reduce((sum, entry) => sum + entry.floor, 0);
  entries.sort((a, b) => b.remainder - a.remainder);

  const mix = {};
  for (const entry of entries) {
    mix[entry.key] = entry.floor + (leftover > 0 ? 1 : 0);
    if (leftover > 0) leftover -= 1;
  }
  return mix;
}

/**
 * Derives starting profile values from a customer's own purchase history.
 * Read-only: nothing here writes to user_profiles.
 */
async function inferProfileEstimates(customerId) {
  const [baskets, { data: categories, error: categoryError }] = await Promise.all([
    fetchAllBaskets(customerId),
    supabase.from("categories").select("id, main_category, subcategory"),
  ]);
  if (categoryError) throw categoryError;

  const spendByMonth = new Map();
  const purchasedCategoryIds = new Set();
  const mixCounts = { healthy: 0, neutral: 0, unhealthy: 0 };
  let itemCount = 0;

  for (const basket of baskets) {
    const monthKey = (basket.purchase_date || "").slice(0, 7);
    for (const item of basket.basket_items || []) {
      if (monthKey) {
        const amount = Number(item.line_total || 0);
        spendByMonth.set(monthKey, (spendByMonth.get(monthKey) || 0) + amount);
      }

      const categoryId = item.products?.category_id ?? item.products?.categories?.id;
      if (categoryId != null) purchasedCategoryIds.add(String(categoryId));

      mixCounts[classificationFromItem(item)] += 1;
      itemCount += 1;
    }
  }

  const monthsOfHistory = spendByMonth.size;
  let budgetMonthly = null;
  if (monthsOfHistory > 0) {
    let total = 0;
    for (const amount of spendByMonth.values()) total += amount;
    const average = total / monthsOfHistory;
    budgetMonthly = Math.round(average / BUDGET_STEP) * BUDGET_STEP;
    if (budgetMonthly === 0 && average > 0) budgetMonthly = BUDGET_STEP;
  }

  const basketCount = baskets.length;
  const unpurchasedLabels = new Set();
  if (basketCount >= MIN_BASKETS_FOR_CATEGORY_SIGNAL) {
    for (const category of categories || []) {
      if (purchasedCategoryIds.has(String(category.id))) continue;
      const label = categoryLabel(category);
      if (label) unpurchasedLabels.add(label);
    }
  }

  return {
    budget_monthly: budgetMonthly,
    monthsOfHistory,
    basketCount,
    itemCount,
    categorySuggestions: [...unpurchasedLabels].sort((a, b) => a.localeCompare(b)),
    healthMix: percentageMix(mixCounts, itemCount),
  };
}

module.exports = { inferProfileEstimates, MIN_BASKETS_FOR_CATEGORY_SIGNAL };
