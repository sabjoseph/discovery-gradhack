/**
 * Shared retailer configuration.
 * Names and fallback shopping destinations live here only, so the recipe
 * detail button (and any future retailer link) stays consistent.
 *
 * We do NOT integrate carts or checkout — fallbackUrl is the retailer's
 * general shopping destination when no recipe/product link is stored.
 */
export const RETAILERS = {
  checkers: {
    id: "checkers",
    name: "Checkers",
    service: "Sixty60",
    buttonLabel: "Open Checkers Sixty60",
    fallbackUrl: "https://www.sixty60.co.za",
    match: /checkers/i,
  },
  woolworths: {
    id: "woolworths",
    name: "Woolworths",
    service: "Dash",
    buttonLabel: "Open Woolworths Dash",
    fallbackUrl: "https://www.woolworths.co.za",
    match: /woolworth|woolies/i,
  },
};

/**
 * Resolve the retailer for a recipe source string.
 * Returns null when the source does not clearly match a known retailer,
 * so we never show an incorrect retailer button.
 */
export function resolveRetailer(source = "") {
  const text = String(source || "");
  for (const retailer of Object.values(RETAILERS)) {
    if (retailer.match.test(text)) return retailer;
  }
  return null;
}

/**
 * Pick the best shopping URL for a recipe:
 * a stored recipe/product URL when available, otherwise the retailer's
 * general shopping destination.
 */
export function retailerShopUrl(recipe, retailer) {
  if (!retailer) return null;
  const stored =
    recipe?.retailerUrl ||
    recipe?.retailer_url ||
    recipe?.shopUrl ||
    recipe?.shop_url ||
    recipe?.productUrl ||
    recipe?.product_url;

  if (stored && typeof stored === "string" && /^https?:\/\//i.test(stored)) {
    return stored;
  }
  return retailer.fallbackUrl;
}
