const supabase = require("../config/supabase");

function classifyFromLabel(classification, mainCategoryFallback) {
  const label = (classification || "").toLowerCase();
  if (label === "healthy") return "healthy";
  if (label === "neutral") return "neutral";
  if (label === "unhealthy") return "unhealthy";

  if (!mainCategoryFallback) return "neutral";
  if (mainCategoryFallback === "Unhealthy foods") return "unhealthy";
  if (mainCategoryFallback === "Dairy") return "neutral";
  return "healthy";
}

function classifyCategory(mainCategory) {
  return classifyFromLabel(null, mainCategory);
}

let cachedDatasetEnd = new Map();

function invalidateDatasetEnd(customerId) {
  if (customerId) cachedDatasetEnd.delete(customerId);
  else cachedDatasetEnd.clear();
}

/**
 * "Today" for demo data = latest purchase date.
 * Prefer per-customer so one person's OCR upload doesn't shift everyone else's month.
 */
async function getDatasetEndDate(customerId) {
  const key = customerId || "__all__";
  if (cachedDatasetEnd.has(key)) return cachedDatasetEnd.get(key);

  let query = supabase
    .from("baskets")
    .select("purchase_date")
    .order("purchase_date", { ascending: false })
    .limit(1);
  if (customerId) query = query.eq("customer_id", customerId);

  const { data } = await query;
  const end = data?.[0]?.purchase_date
    ? new Date(data[0].purchase_date)
    : new Date();
  cachedDatasetEnd.set(key, end);
  return end;
}

async function daysAgo(days, customerId) {
  const end = await getDatasetEndDate(customerId);
  const d = new Date(end);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function daysUntilFrom(dateStr, now) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

async function daysUntil(dateStr, customerId) {
  const now = await getDatasetEndDate(customerId);
  return daysUntilFrom(dateStr, now);
}

module.exports = {
  classifyCategory,
  classifyFromLabel,
  daysAgo,
  daysUntil,
  daysUntilFrom,
  getDatasetEndDate,
  invalidateDatasetEnd,
};
