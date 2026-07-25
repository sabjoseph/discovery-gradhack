const express = require("express");
const supabase = require("../config/supabase");
const {
  classifyFromLabel,
  daysAgo,
  daysUntilFrom,
  getDatasetEndDate,
} = require("../utils/health");

const router = express.Router();

const HEALTHY_GOAL = 60;
const FRESH_GOAL = 90;
const HEALTHY_POINTS = 40;
const PANTRY_POINTS = 15;

const SWAP_RULES = [
  {
    match: /sugar|sweet|chocol|biscuit|candy|dessert|custard|rusk/i,
    toSubcategory: "Fruit",
    toName: "Fresh seasonal fruit",
    reason: "Swap sweets for natural fruit sugars and fibre",
  },
  {
    match: /drink|beverage|soda|juice|cool/i,
    toSubcategory: "Fruit",
    toName: "Sparkling water or fruit infusion",
    reason: "Cut liquid sugar while keeping a refreshing drink",
  },
  {
    match: /processed|sausage|polony|bacon|cold.?meat/i,
    toSubcategory: "Chicken",
    toName: "Lean chicken portions",
    reason: "Trade processed meat for lean animal protein",
  },
  {
    match: /white.?bread|refined|pasta and noodle|instant/i,
    toSubcategory: "Whole grains",
    toName: "Whole-grain bread or wraps",
    reason: "More fibre, steadier energy",
  },
  {
    match: /fried|chip|crisp|high fat|baked and fried/i,
    toSubcategory: "Fish and seafood",
    toName: "Grilled fish",
    reason: "Same convenience vibe, far healthier prep",
  },
  {
    match: /snack|treat/i,
    toSubcategory: "Nuts and seeds",
    toName: "Unsalted nuts portion",
    reason: "Crunchy snack with healthy fats",
  },
];

const DEFAULT_SWAP = {
  toSubcategory: "Fruit and vegetables",
  toName: "Extra fruit & veg portion",
  reason: "Replace an unhealthy buy with a HealthyFood staple",
};

let cachedPeers = null;

function findSwapRule(subcategory) {
  for (const rule of SWAP_RULES) {
    if (rule.match.test(subcategory || "")) return rule;
  }
  return DEFAULT_SWAP;
}

function classificationFromItem(item) {
  const nested = item.products?.categories?.health_classifications;
  const label = Array.isArray(nested)
    ? nested[0]?.classification
    : nested?.classification;
  if (label) return classifyFromLabel(label);
  return classifyFromLabel(null, item.products?.categories?.main_category);
}

function scoreFromMix(healthy, neutral, total) {
  if (!total) return 0;
  const healthyPct = (healthy / total) * 100;
  const neutralPct = (neutral / total) * 100;
  return Math.round(healthyPct + 0.5 * neutralPct);
}

function pct(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function weekStartKey(dateStr) {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weekLabel(weekStart) {
  return new Date(weekStart).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
  });
}

function accumulateBasket(basket, spend, bySubcat, byProduct, weekMap) {
  const dayKey = (basket.purchase_date || "").slice(0, 10);
  const weekKey = weekStartKey(dayKey || new Date().toISOString());
  if (!weekMap.has(weekKey)) {
    weekMap.set(weekKey, { healthy: 0, neutral: 0, unhealthy: 0, total: 0 });
  }
  const week = weekMap.get(weekKey);

  for (const item of basket.basket_items || []) {
    const amount = Number(item.line_total || 0);
    const tag = classificationFromItem(item);
    const cat = item.products?.categories;
    const subcategory = cat?.subcategory || "Uncategorised";
    const main = cat?.main_category || "Other";
    const productId = item.products?.id;
    const productName = item.products?.name || "Unknown product";

    spend[tag] += amount;
    spend.total += amount;
    week[tag] += amount;
    week.total += amount;

    if (!bySubcat.has(subcategory)) {
      bySubcat.set(subcategory, {
        subcategory,
        main,
        tag,
        spend: 0,
      });
    }
    const catRow = bySubcat.get(subcategory);
    catRow.spend += amount;
    if (tag === "unhealthy") catRow.tag = "unhealthy";
    else if (tag === "healthy" && catRow.tag !== "unhealthy") {
      catRow.tag = "healthy";
    }

    if (productId) {
      if (!byProduct.has(productId)) {
        byProduct.set(productId, {
          productId,
          name: productName,
          subcategory,
          main,
          tag,
          spend: 0,
        });
      }
      byProduct.get(productId).spend += amount;
    }
  }
}

function buildTrend(weekMap) {
  return [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, mix]) => ({
      weekStart,
      label: weekLabel(weekStart),
      score: scoreFromMix(mix.healthy, mix.neutral, mix.total),
      healthyPct: pct(mix.healthy, mix.total),
      total: Math.round(mix.total),
    }));
}

function buildCategories(bySubcat, total) {
  return [...bySubcat.values()]
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 12)
    .map((c) => ({
      ...c,
      spend: Math.round(c.spend * 100) / 100,
      pct: pct(c.spend, total),
      signedSpend:
        c.tag === "unhealthy" ? -Math.round(c.spend) : Math.round(c.spend),
    }));
}

function lookupAvgPrice(avgPriceBySubcat, targetSub) {
  if (avgPriceBySubcat.has(targetSub)) return avgPriceBySubcat.get(targetSub);
  const needle = (targetSub || "").toLowerCase();
  for (const [sub, avg] of avgPriceBySubcat) {
    if (
      sub.toLowerCase().includes(needle) ||
      needle.includes(sub.toLowerCase())
    ) {
      return avg;
    }
  }
  for (const [sub, avg] of avgPriceBySubcat) {
    if (/fruit|veg|legume|whole grain/i.test(sub)) return avg;
  }
  return null;
}

function buildSwaps(byProduct, avgPriceBySubcat, spend) {
  const unhealthy = [...byProduct.values()]
    .filter((p) => p.tag === "unhealthy" && p.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  const swaps = [];
  const used = new Set();
  const currentScore = scoreFromMix(spend.healthy, spend.neutral, spend.total);
  let runningHealthy = spend.healthy;
  let runningUnhealthy = spend.unhealthy;

  for (const item of unhealthy) {
    if (swaps.length >= 5) break;
    if (used.has(item.productId)) continue;
    used.add(item.productId);

    const rule = findSwapRule(item.subcategory);
    const estPrice =
      lookupAvgPrice(avgPriceBySubcat, rule.toSubcategory) ??
      Math.max(20, item.spend * 0.85);

    const moved = item.spend;
    runningHealthy += moved;
    runningUnhealthy = Math.max(0, runningUnhealthy - moved);
    const projectedScore = scoreFromMix(
      runningHealthy,
      spend.neutral,
      spend.total
    );

    swaps.push({
      id: item.productId,
      fromName: item.name,
      fromSpend: Math.round(item.spend * 100) / 100,
      fromCategory: item.subcategory,
      toName: rule.toName,
      toCategory: rule.toSubcategory,
      estPrice: Math.round(estPrice * 100) / 100,
      scoreGain: Math.max(0, projectedScore - currentScore),
      randDelta: Math.round(estPrice - item.spend),
      reason: rule.reason,
    });
  }

  return swaps;
}

function projectedScoreFromSwaps(spend, swaps) {
  let healthy = spend.healthy;
  for (const s of swaps) {
    healthy += s.fromSpend;
  }
  return scoreFromMix(healthy, spend.neutral, spend.total);
}

function buildPeerHistogram(values) {
  const bins = [
    { label: "0–20", min: 0, max: 20, count: 0 },
    { label: "20–40", min: 20, max: 40, count: 0 },
    { label: "40–60", min: 40, max: 60, count: 0 },
    { label: "60–80", min: 60, max: 80, count: 0 },
    { label: "80–100", min: 80, max: 101, count: 0 },
  ];
  for (const v of values) {
    const bin = bins.find((b) => v >= b.min && v < b.max);
    if (bin) bin.count += 1;
  }
  return bins.map(({ label, count }) => ({ label, count }));
}

function percentileOf(value, sortedAsc) {
  if (!sortedAsc.length) return 50;
  let below = 0;
  for (const v of sortedAsc) {
    if (v < value) below += 1;
    else break;
  }
  return Math.round((below / sortedAsc.length) * 100);
}

async function getPeerStats(force = false) {
  if (cachedPeers && !force) return cachedPeers;

  const since = await daysAgo(90);
  const { data: baskets, error } = await supabase
    .from("baskets")
    .select(
      `
      customer_id,
      basket_items (
        line_total,
        products (
          categories (
            main_category,
            health_classifications ( classification )
          )
        )
      )
    `
    )
    .gte("purchase_date", since);

  if (error) throw error;

  const byCustomer = new Map();
  for (const basket of baskets || []) {
    const id = basket.customer_id;
    if (!byCustomer.has(id)) {
      byCustomer.set(id, { healthy: 0, unhealthy: 0, total: 0 });
    }
    const row = byCustomer.get(id);
    for (const item of basket.basket_items || []) {
      const amount = Number(item.line_total || 0);
      row.total += amount;
      const tag = classificationFromItem(item);
      if (tag === "healthy") row.healthy += amount;
      if (tag === "unhealthy") row.unhealthy += amount;
    }
  }

  const rows = [...byCustomer.values()].filter((r) => r.total > 0);
  const values = rows.map((r) => pct(r.healthy, r.total)).sort((a, b) => a - b);

  const sortedByHealthy = [...rows].sort(
    (a, b) => pct(b.healthy, b.total) - pct(a.healthy, a.total)
  );
  const topCount = Math.max(1, Math.ceil(sortedByHealthy.length * 0.1));
  const topSlice = sortedByHealthy.slice(0, topCount);
  const topAvgUnhealthy =
    topSlice.reduce((sum, r) => sum + r.unhealthy, 0) / topSlice.length;

  cachedPeers = {
    values,
    distribution: buildPeerHistogram(values),
    customerCount: values.length,
    topAvgUnhealthy: Math.round(topAvgUnhealthy),
  };
  return cachedPeers;
}

const BASKET_SELECT = `
  id,
  purchase_date,
  retailer_id,
  basket_items (
    id,
    quantity,
    unit_price,
    line_total,
    products (
      id,
      name,
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

router.post("/:customerId/swaps/accept", async (req, res) => {
  try {
    const { customerId } = req.params;
    const { fromName, toName, fromSpend, estPrice, fromCategory, toCategory } =
      req.body || {};

    if (!fromName || !toName) {
      return res
        .status(400)
        .json({ success: false, message: "fromName and toName are required" });
    }

    const { error } = await supabase.from("activity_log").insert({
      customer_id: customerId,
      event_type: "swap_accepted",
      metadata: {
        fromName,
        toName,
        fromSpend,
        estPrice,
        fromCategory,
        toCategory,
        source: "analytics",
      },
    });

    if (error) throw error;

    res.json({
      success: true,
      data: {
        accepted: true,
        message: `${toName} added to your healthier shopping intent`,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const days = Number(req.query.days || 90);
    const since = await daysAgo(days);
    const previousSince = await daysAgo(days * 2);
    const datasetEnd = await getDatasetEndDate();

    const monthStart = new Date(datasetEnd);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      { data: baskets, error: basketError },
      { data: previousBaskets, error: prevError },
      { data: pantry, error: pantryError },
      { data: profile },
      { data: monthBaskets, error: monthError },
      peers,
    ] = await Promise.all([
      supabase
        .from("baskets")
        .select(BASKET_SELECT)
        .eq("customer_id", customerId)
        .gte("purchase_date", since)
        .order("purchase_date", { ascending: false }),
      supabase
        .from("baskets")
        .select(BASKET_SELECT)
        .eq("customer_id", customerId)
        .gte("purchase_date", previousSince)
        .lt("purchase_date", since),
      supabase
        .from("pantry_items")
        .select("id, expiry_estimate")
        .eq("customer_id", customerId)
        .gt("quantity_remaining", 0),
      supabase
        .from("user_profiles")
        .select("budget_monthly")
        .eq("id", customerId)
        .maybeSingle(),
      supabase
        .from("baskets")
        .select("basket_items ( line_total )")
        .eq("customer_id", customerId)
        .gte("purchase_date", monthStart.toISOString()),
      getPeerStats(),
    ]);

    if (basketError) throw basketError;
    if (prevError) throw prevError;
    if (pantryError) throw pantryError;
    if (monthError) throw monthError;

    const spend = { healthy: 0, neutral: 0, unhealthy: 0, total: 0 };
    const prevSpend = { healthy: 0, neutral: 0, unhealthy: 0, total: 0 };
    const bySubcat = new Map();
    const byProduct = new Map();
    const weekMap = new Map();
    const avgPriceAcc = new Map();

    for (const basket of baskets || []) {
      accumulateBasket(basket, spend, bySubcat, byProduct, weekMap);
      for (const item of basket.basket_items || []) {
        const sub = item.products?.categories?.subcategory;
        const price = Number(item.unit_price || 0);
        if (!sub || !price) continue;
        if (!avgPriceAcc.has(sub)) avgPriceAcc.set(sub, { sum: 0, n: 0 });
        const a = avgPriceAcc.get(sub);
        a.sum += price;
        a.n += 1;
      }
    }

    for (const basket of previousBaskets || []) {
      for (const item of basket.basket_items || []) {
        const amount = Number(item.line_total || 0);
        const tag = classificationFromItem(item);
        prevSpend[tag] += amount;
        prevSpend.total += amount;
      }
    }

    const avgPriceBySubcat = new Map();
    for (const [sub, { sum, n }] of avgPriceAcc) {
      avgPriceBySubcat.set(sub, sum / n);
    }

    const scoreValue = scoreFromMix(spend.healthy, spend.neutral, spend.total);
    const previousScore = scoreFromMix(
      prevSpend.healthy,
      prevSpend.neutral,
      prevSpend.total
    );
    const healthyPct = pct(spend.healthy, spend.total);
    const neutralPct = pct(spend.neutral, spend.total);
    const unhealthyPct = pct(spend.unhealthy, spend.total);

    let monthSpend = 0;
    for (const basket of monthBaskets || []) {
      for (const item of basket.basket_items || []) {
        monthSpend += Number(item.line_total || 0);
      }
    }

    const budgetMonthly =
      profile?.budget_monthly != null ? Number(profile.budget_monthly) : null;
    const hasBudget = budgetMonthly != null && !Number.isNaN(budgetMonthly);
    const budgetTarget = hasBudget
      ? budgetMonthly
      : spend.total > 0
        ? Math.round(spend.total)
        : null;
    const usedPct =
      budgetTarget && budgetTarget > 0
        ? Math.min(150, Math.round((monthSpend / budgetTarget) * 100))
        : 0;

    const pantryItems = pantry || [];
    const pantryCount = pantryItems.length;
    let expiringSoon = 0;
    for (const p of pantryItems) {
      const daysLeft = daysUntilFrom(p.expiry_estimate, datasetEnd);
      if (daysLeft !== null && daysLeft <= 3) expiringSoon += 1;
    }
    const freshPct = pantryCount
      ? Math.round(((pantryCount - expiringSoon) / pantryCount) * 100)
      : 0;

    const swaps = buildSwaps(byProduct, avgPriceBySubcat, spend);
    const projectedScore = projectedScoreFromSwaps(spend, swaps);

    const youHealthyPct = healthyPct;
    const percentile = percentileOf(youHealthyPct, peers.values);
    const yourBin = peers.distribution.find((b) => {
      const [lo, hi] = b.label.split("–").map(Number);
      return youHealthyPct >= lo && youHealthyPct < (hi === 100 ? 101 : hi);
    });

    const yourUnhealthy = Math.round(spend.unhealthy);
    const unhealthyGap = Math.round(yourUnhealthy - peers.topAvgUnhealthy);

    res.json({
      success: true,
      data: {
        periodDays: days,
        datasetEnd: datasetEnd.toISOString(),
        score: {
          value: scoreValue,
          previous: previousScore,
          delta: scoreValue - previousScore,
          goal: HEALTHY_GOAL,
          healthyPct,
          neutralPct,
          unhealthyPct,
          formula:
            "Score = healthy% of spend + half of neutral% (rand-weighted)",
        },
        rings: {
          healthy: {
            current: healthyPct,
            target: HEALTHY_GOAL,
            closed: healthyPct >= HEALTHY_GOAL,
            points: HEALTHY_POINTS,
            label: "Healthy",
          },
          budget: {
            monthSpend: Math.round(monthSpend * 100) / 100,
            budget: hasBudget ? budgetMonthly : budgetTarget,
            usedPct,
            over: hasBudget ? monthSpend > budgetMonthly : false,
            remaining: hasBudget
              ? Math.round((budgetMonthly - monthSpend) * 100) / 100
              : null,
            inferred: !hasBudget,
            label: hasBudget ? "Budget" : "Typical spend",
          },
          pantry: {
            freshPct,
            target: FRESH_GOAL,
            itemCount: pantryCount,
            expiringSoon,
            closed: pantryCount > 0 && freshPct >= FRESH_GOAL,
            points: PANTRY_POINTS,
            label: "Pantry fresh",
          },
        },
        trend: buildTrend(weekMap),
        categories: buildCategories(bySubcat, spend.total),
        swaps,
        projectedScore,
        peers: {
          customerCount: peers.customerCount,
          distribution: peers.distribution.map((b) => ({
            ...b,
            isYours: yourBin?.label === b.label,
          })),
          percentile,
          yourHealthyPct: youHealthyPct,
          yourUnhealthySpend: yourUnhealthy,
          topAvgUnhealthySpend: peers.topAvgUnhealthy,
          unhealthyGap,
          insight:
            unhealthyGap > 50
              ? `Shoppers in the top 10% spend about R${unhealthyGap} less on unhealthy items than you over this period.`
              : percentile >= 80
                ? `You're among the healthier shoppers — ${percentile}th percentile on healthy spend.`
                : `You're at the ${percentile}th percentile of HealthyFood shoppers by healthy spend share.`,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
