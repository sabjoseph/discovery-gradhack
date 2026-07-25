import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const client = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

async function get(path, params) {
  const { data } = await client.get(path, { params });
  return data;
}

async function post(path, body) {
  const { data } = await client.post(path, body);
  return data;
}

async function put(path, body) {
  const { data } = await client.put(path, body);
  return data;
}

export const api = {
  getCustomers: (q) => get("/api/customers", q ? { q } : undefined),
  getCustomer: (id) => get(`/api/customers/${id}`),
  getDashboard: (customerId, days = 30) =>
    get(`/api/dashboard/${customerId}`, { days }),
  getPurchases: (customerId, params) =>
    get(`/api/purchases/${customerId}`, params),
  getPurchasesMeta: (customerId) => get(`/api/purchases/${customerId}/meta`),
  getPurchaseBasket: (customerId, basketId) =>
    get(`/api/purchases/${customerId}/${basketId}`),
  getPantry: (customerId) => get(`/api/pantry/${customerId}`),
  usePantryItem: (customerId, itemId, amount = 1) =>
    post(`/api/pantry/${customerId}/${itemId}/use`, { amount }),
  getRecipes: (customerId) =>
    get("/api/recipes", customerId ? { customerId } : undefined),
  getRecipe: (id, customerId) =>
    get(`/api/recipes/${id}`, customerId ? { customerId } : undefined),
  getRecommendations: (customerId) =>
    get(`/api/recommendations/${customerId}`),
  actOnRecommendation: (customerId, recommendationId, action) =>
    post(`/api/recommendations/${customerId}/${recommendationId}/action`, {
      action,
    }),
  getMilestones: (customerId) => get(`/api/milestones/${customerId}`),
  getRewards: (customerId) => get(`/api/rewards/${customerId}`),
  redeemReward: (customerId, rewardId) =>
    post(`/api/rewards/${customerId}/redeem`, { rewardId }),
  getProfile: (customerId) => get(`/api/profile/${customerId}`),
  updateProfile: (customerId, body) => put(`/api/profile/${customerId}`, body),
  getAnalytics: (customerId, days = 90) =>
    get(`/api/analytics/${customerId}`, { days }),
};

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
