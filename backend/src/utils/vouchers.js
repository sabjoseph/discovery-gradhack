/**
 * Vouchers are stored on user_profiles.health_goals as a reserved object:
 * { __vouchers: true, items: [...] }
 * Same pattern as body metrics — no schema migration required.
 */

const REWARD_CATALOG = [
  {
    id: "fruit-50",
    name: "Fresh fruit voucher",
    detail: "R50 off seasonal fruit at Checkers or Woolworths",
    points: 50,
    valueZar: 50,
  },
  {
    id: "veggie-75",
    name: "Veggie box top-up",
    detail: "R75 credit toward a weekly vegetable box",
    points: 80,
    valueZar: 75,
  },
  {
    id: "meal-kit",
    name: "Vitality meal kit",
    detail: "One Discovery Vitality healthy meal kit delivery",
    points: 120,
    valueZar: 120,
  },
  {
    id: "protein-100",
    name: "Free-range protein pack",
    detail: "R100 off chicken, ostrich, or plant-based protein",
    points: 150,
    valueZar: 100,
  },
  {
    id: "pantry-bundle",
    name: "Pantry essentials bundle",
    detail: "Olive oil, legumes, and whole grains starter pack",
    points: 200,
    valueZar: 150,
  },
  {
    id: "family-250",
    name: "Family healthy shop",
    detail: "R250 grocery voucher for healthy basket items",
    points: 300,
    valueZar: 250,
  },
  {
    id: "discovery-cookery",
    name: "The Cookery voucher",
    detail: "Free when you buy 10 healthy foods this month",
    points: 0,
    valueZar: 500,
    unlockCriteria: "healthy_foods",
    once: true,
  },
];

function buildVoucherFromReward(reward) {
  return {
    id: `vch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    rewardId: reward.id,
    name: reward.name,
    detail: reward.detail,
    pointsCost: reward.points,
    valueZar: reward.valueZar,
    code: generateVoucherCode(),
    status: "active",
    issuedAt: new Date().toISOString(),
  };
}

function extractVouchers(healthGoals) {
  const list = Array.isArray(healthGoals) ? healthGoals : [];
  const entry = list.find(
    (item) => item && typeof item === "object" && item.__vouchers
  );
  return Array.isArray(entry?.items) ? entry.items : [];
}

function withVouchers(healthGoals, vouchers) {
  const list = Array.isArray(healthGoals) ? [...healthGoals] : [];
  const filtered = list.filter(
    (item) => !(item && typeof item === "object" && item.__vouchers)
  );
  filtered.push({
    __vouchers: true,
    items: Array.isArray(vouchers) ? vouchers : [],
  });
  return filtered;
}

function generateVoucherCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = (len) =>
    Array.from({ length: len }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)]
    ).join("");
  return `BB-${chunk(4)}-${chunk(4)}`;
}

function pointsSpent(vouchers) {
  return (vouchers || []).reduce(
    (sum, v) => sum + Number(v.pointsCost || 0),
    0
  );
}

function findReward(rewardId) {
  return REWARD_CATALOG.find((r) => r.id === rewardId) || null;
}

module.exports = {
  REWARD_CATALOG,
  extractVouchers,
  withVouchers,
  generateVoucherCode,
  pointsSpent,
  findReward,
  buildVoucherFromReward,
};
