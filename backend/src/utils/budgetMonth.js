/**
 * Shared month-budget helpers so Home, Purchases and Analytics agree on
 * "spent this month".
 */

function monthKeyFromDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function emptyMonth() {
  return {
    monthSpend: 0,
    checkersSpend: 0,
    wooliesSpend: 0,
    otherSpend: 0,
    basketCount: 0,
  };
}

function retailerBucket(name) {
  const label = (name || "").toLowerCase();
  if (label.includes("checker")) return "checkers";
  if (label.includes("woolworth") || label.includes("woolies")) return "woolies";
  return "other";
}

/**
 * @param {Array<{purchase_date?: string, purchaseDate?: string, retailers?: {name?: string}, retailer?: string, basket_items?: Array<{line_total?: number}>, total?: number}>} baskets
 * @returns {Record<string, ReturnType<typeof emptyMonth>>}
 */
function groupSpendByMonth(baskets) {
  const byMonth = {};
  for (const basket of baskets || []) {
    const raw = basket.purchase_date || basket.purchaseDate;
    if (!raw) continue;
    const key = raw.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = emptyMonth();

    let basketTotal = 0;
    if (Array.isArray(basket.basket_items)) {
      for (const item of basket.basket_items) {
        basketTotal += Number(item.line_total || 0);
      }
    } else {
      basketTotal = Number(basket.total || 0);
    }

    const bucket = retailerBucket(basket.retailers?.name || basket.retailer);
    byMonth[key].monthSpend += basketTotal;
    byMonth[key].basketCount += 1;
    if (bucket === "checkers") byMonth[key].checkersSpend += basketTotal;
    else if (bucket === "woolies") byMonth[key].wooliesSpend += basketTotal;
    else byMonth[key].otherSpend += basketTotal;
  }
  return byMonth;
}

/**
 * Pick the budget month to display.
 * Uses the calendar month of datasetEnd, unless that month is almost empty
 * (e.g. one scanned receipt) — then falls back to the strongest of the
 * previous two months so Home and Purchases stay aligned with seed data.
 *
 * @param {Record<string, ReturnType<typeof emptyMonth>>} byMonth
 * @param {Date} datasetEnd
 * @returns {{ key: string|null, stats: ReturnType<typeof emptyMonth> }}
 */
function pickActiveBudgetMonth(byMonth, datasetEnd) {
  const candidateKeys = [];
  for (let i = 0; i < 3; i += 1) {
    const d = new Date(datasetEnd);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = monthKeyFromDate(d);
    if (byMonth[key]) candidateKeys.push(key);
  }

  let activeKey =
    candidateKeys[0] || Object.keys(byMonth).sort().pop() || null;

  if (candidateKeys.length > 1) {
    const latest = byMonth[candidateKeys[0]];
    const latestIsSparse =
      latest.basketCount <= 2 ||
      candidateKeys
        .slice(1)
        .some((key) => latest.monthSpend < byMonth[key].monthSpend * 0.25);

    if (latestIsSparse) {
      activeKey = candidateKeys.slice(1).reduce((best, key) => {
        const a = byMonth[key];
        const b = byMonth[best];
        if (a.monthSpend > b.monthSpend) return key;
        if (a.monthSpend === b.monthSpend && a.basketCount > b.basketCount) {
          return key;
        }
        return best;
      }, candidateKeys[1]);
    }
  }

  return {
    key: activeKey,
    stats: (activeKey && byMonth[activeKey]) || emptyMonth(),
  };
}

function monthLabel(key) {
  if (!key) return "This month";
  return new Date(`${key}-01T00:00:00`).toLocaleString("en-ZA", {
    month: "long",
    year: "numeric",
  });
}

module.exports = {
  groupSpendByMonth,
  pickActiveBudgetMonth,
  monthLabel,
  monthKeyFromDate,
  retailerBucket,
};
