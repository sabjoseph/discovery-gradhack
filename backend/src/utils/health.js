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

let cachedDatasetEnd = null;

function invalidateDatasetEnd() {
  cachedDatasetEnd = null;
}

async function getDatasetEndDate() {
  if (cachedDatasetEnd) return cachedDatasetEnd;
  const { data } = await supabase
    .from("baskets")
    .select("purchase_date")
    .order("purchase_date", { ascending: false })
    .limit(1);
  cachedDatasetEnd = data?.[0]?.purchase_date
    ? new Date(data[0].purchase_date)
    : new Date();
  return cachedDatasetEnd;
}

async function daysAgo(days) {
  const end = await getDatasetEndDate();
  const d = new Date(end);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function daysUntilFrom(dateStr, now) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

async function daysUntil(dateStr) {
  const now = await getDatasetEndDate();
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
