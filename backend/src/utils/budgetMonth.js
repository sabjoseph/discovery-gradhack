/**
 * Shared spend-window helpers so Home, Purchases and recommendations agree
 * on "spent in the last 30 days".
 */

function retailerBucket(name) {
  const label = (name || "").toLowerCase();
  if (label.includes("checker")) return "checkers";
  if (label.includes("woolworth") || label.includes("woolies")) return "woolies";
  return "other";
}

function emptySpendStats() {
  return {
    monthSpend: 0,
    checkersSpend: 0,
    wooliesSpend: 0,
    otherSpend: 0,
    basketCount: 0,
  };
}

/** Accepts both backend (snake_case + basket_items) and frontend basket shapes. */
function addBasketToStats(stats, basket) {
  let basketTotal = 0;
  if (Array.isArray(basket.basket_items)) {
    for (const item of basket.basket_items) {
      basketTotal += Number(item.line_total || 0);
    }
  } else {
    basketTotal = Number(basket.total || 0);
  }

  const bucket = retailerBucket(basket.retailers?.name || basket.retailer);
  stats.monthSpend += basketTotal;
  stats.basketCount += 1;
  if (bucket === "checkers") stats.checkersSpend += basketTotal;
  else if (bucket === "woolies") stats.wooliesSpend += basketTotal;
  else stats.otherSpend += basketTotal;
}

/**
 * Start of the rolling 30-day window that ends on the given date
 * (usually the customer's latest purchase date).
 */
function windowStartFor(endDate, days = 30) {
  const start = new Date(endDate);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Sums spend for baskets that fall inside [startDate, endDate]. */
function spendStatsForWindow(baskets, startDate, endDate) {
  const stats = emptySpendStats();
  for (const basket of baskets || []) {
    const raw = basket.purchase_date || basket.purchaseDate;
    if (!raw) continue;
    const d = new Date(raw);
    if (d < startDate || d > endDate) continue;
    addBasketToStats(stats, basket);
  }
  return stats;
}

const SPEND_WINDOW_LABEL = "Last 30 days";

module.exports = {
  retailerBucket,
  emptySpendStats,
  addBasketToStats,
  windowStartFor,
  spendStatsForWindow,
  SPEND_WINDOW_LABEL,
};
