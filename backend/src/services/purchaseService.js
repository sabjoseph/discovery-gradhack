const supabase = require("../config/supabase");
const { invalidateDatasetEnd } = require("../utils/health");
const { saveReceiptRecord } = require("./receiptStorage");

const SUPPORTED_STORES = ["Checkers", "Woolworths"];

// Used when we cannot guess a category from the product name. `products.category_id`
// is NOT NULL in Supabase, so every new product must get a value.
const DEFAULT_CATEGORY_ID = 14; // Snacks and condiments high in salt

// Keyword → category id mapping used when a receipt item doesn't match an
// existing product. Categories come from the `categories` table.
const CATEGORY_KEYWORDS = [
  { id: 21, words: ["milk", "long life"] },
  { id: 17, words: ["soya milk", "soy milk", "almond milk", "oat milk"] },
  { id: 23, words: ["yoghurt", "yogurt", "maas"] },
  { id: 8, words: ["cottage cheese", "cheese", "cream cheese", "feta", "gouda", "cheddar"] },
  { id: 18, words: ["egg"] },
  { id: 24, words: ["chicken", "braai pack", "drumstick", "fillet"] },
  { id: 3, words: ["fish", "hake", "salmon", "prawn", "seafood"] },
  { id: 5, words: ["tuna", "pilchard", "sardine"] },
  { id: 9, words: ["bread", "roll", "bun", "loaf", "wrap", "pita"] },
  { id: 2, words: ["oats", "rice", "quinoa", "barley", "muesli", "granola", "cereal"] },
  { id: 25, words: ["pasta", "spaghetti", "macaroni", "noodle", "penne"] },
  { id: 13, words: ["maize", "mielie", "pap", "samp"] },
  { id: 15, words: ["couscous"] },
  { id: 12, words: ["cracker", "crispbread", "rice cake"] },
  { id: 22, words: ["beans", "lentil", "chickpea", "legume"] },
  { id: 26, words: ["tofu", "soy mince"] },
  { id: 16, words: ["oil", "spray", "olive oil", "canola"] },
  { id: 20, words: ["peanut butter", "nut butter"] },
  { id: 19, words: ["nuts", "almond", "cashew", "seed", "peanut"] },
  { id: 6, words: ["tinned tomato", "canned", "tinned"] },
  { id: 27, words: ["dried herb", "spice", "herbs"] },
  {
    id: 10,
    words: [
      "cola", "soda", "soft drink", "energy drink", "fizzy", "red bull", "monster",
      "score energy", "powerade", "energade", "sprite", "fanta", "sting",
    ],
  },
  { id: 14, words: ["chips", "crisps", "pretzel", "salty"] },
  { id: 11, words: ["pie", "fried", "doughnut", "donut", "pastry"] },
  { id: 1, words: ["chocolate", "sweet", "candy", "biscuit", "cookie", "cake", "sugar", "ice cream"] },
  {
    id: 7,
    words: [
      "apple", "banana", "orange", "grape", "berry", "pear", "peach", "melon", "pineapple", "avocado",
      "tomato", "onion", "potato", "carrot", "spinach", "lettuce", "pepper", "broccoli", "cauliflower",
      "cucumber", "mushroom", "butternut", "pumpkin", "garlic", "ginger", "lemon", "veg", "fruit", "salad",
    ],
  },
];

// Rough shelf life (days) used to estimate pantry expiry for new items.
const EXPIRY_DAYS_BY_MAIN_CATEGORY = {
  "Fruit and vegetables": 7,
  Dairy: 10,
  "Animal protein": 5,
  "Whole grains and high-fibre starchy foods": 120,
  Legumes: 180,
  "Oils, nuts and seeds": 180,
  "Unhealthy foods": 60,
};

function guessCategoryId(name) {
  const lower = ` ${(name || "").toLowerCase()} `;
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.words.some((w) => lower.includes(w))) return entry.id;
  }
  return DEFAULT_CATEGORY_ID;
}

async function nextId(table, prefix, padLength) {
  const { data } = await supabase
    .from(table)
    .select("id")
    .like("id", `${prefix}%`)
    .order("id", { ascending: false })
    .limit(1);
  const last = data?.[0]?.id || `${prefix}${"0".repeat(padLength)}`;
  const num = Number(last.replace(prefix, "")) || 0;
  return `${prefix}${String(num + 1).padStart(padLength, "0")}`;
}

/**
 * Finds an existing product by name (exact first, then contains) or creates
 * one with a keyword-guessed category.
 */
async function matchOrCreateProduct(name) {
  const cleaned = name.trim();

  const { data: exact } = await supabase
    .from("products")
    .select("id, name, category_id")
    .ilike("name", cleaned)
    .limit(1);
  if (exact?.length) return { product: exact[0], created: false };

  const { data: partial } = await supabase
    .from("products")
    .select("id, name, category_id")
    .ilike("name", `%${cleaned}%`)
    .limit(1);
  if (partial?.length) return { product: partial[0], created: false };

  const id = await nextId("products", "PROD-", 4);
  const categoryId = guessCategoryId(cleaned);
  const { data: inserted, error } = await supabase
    .from("products")
    .insert({ id, name: cleaned, category_id: categoryId })
    .select("id, name, category_id")
    .single();
  if (error) throw new Error(`Could not create product "${cleaned}": ${error.message}`);
  return { product: inserted, created: true };
}

async function getMainCategory(categoryId) {
  if (categoryId == null) return null;
  const { data } = await supabase
    .from("categories")
    .select("main_category")
    .eq("id", categoryId)
    .maybeSingle();
  return data?.main_category || null;
}

function estimateExpiry(purchaseDate, mainCategory) {
  const days = EXPIRY_DAYS_BY_MAIN_CATEGORY[mainCategory] ?? 30;
  const d = new Date(purchaseDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Adds purchased quantities into the pantry (update if present, else insert). */
async function syncPantry(customerId, purchaseDate, resolvedItems) {
  let updated = 0;
  let created = 0;

  for (const item of resolvedItems) {
    const { data: existing } = await supabase
      .from("pantry_items")
      .select("id, quantity_remaining")
      .eq("customer_id", customerId)
      .eq("product_id", item.productId)
      .order("id", { ascending: true })
      .limit(1);

    if (existing?.length) {
      const row = existing[0];
      const { error } = await supabase
        .from("pantry_items")
        .update({ quantity_remaining: Number(row.quantity_remaining) + item.quantity })
        .eq("id", row.id);
      if (error) throw error;
      updated += 1;
    } else {
      const mainCategory = await getMainCategory(item.categoryId);
      const { error } = await supabase.from("pantry_items").insert({
        customer_id: customerId,
        product_id: item.productId,
        quantity_remaining: item.quantity,
        added_date: purchaseDate,
        expiry_estimate: estimateExpiry(purchaseDate, mainCategory),
      });
      if (error) throw error;
      created += 1;
    }
  }

  return { updated, created };
}

/**
 * Creates the full purchase: basket + items, pantry sync, receipt record and
 * activity log. Recipe availability needs no explicit trigger — it is
 * computed from the pantry on every request.
 *
 * @param {object} input
 * @param {string} input.customerId
 * @param {string} input.store "Checkers" | "Woolworths"
 * @param {string} input.purchaseDate YYYY-MM-DD (date only)
 * @param {Array<{name: string, quantity: number, unitPrice: number, lineTotal: number}>} input.items
 * @param {object} [input.receipt] { imagePath, imageUrl, ocrText, ocrDraft, provider }
 */
async function createPurchase({ customerId, store, purchaseDate, items, receipt }) {
  if (!SUPPORTED_STORES.includes(store)) {
    const err = new Error("Only Checkers and Woolworths receipts are currently supported.");
    err.status = 422;
    throw err;
  }

  const basketId = await nextId("baskets", "BASK-", 6);
  const dateOnly = purchaseDate.slice(0, 10);

  const { error: basketError } = await supabase.from("baskets").insert({
    id: basketId,
    customer_id: customerId,
    retailer_id: store,
    purchase_date: dateOnly,
  });
  if (basketError) throw new Error(`Could not create purchase: ${basketError.message}`);

  const resolvedItems = [];
  let productsCreated = 0;
  try {
    for (const item of items) {
      const { product, created } = await matchOrCreateProduct(item.name);
      if (created) productsCreated += 1;
      resolvedItems.push({
        productId: product.id,
        categoryId: product.category_id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      });
    }

    const { error: itemsError } = await supabase.from("basket_items").insert(
      resolvedItems.map((it) => ({
        basket_id: basketId,
        product_id: it.productId,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        line_total: it.lineTotal,
      }))
    );
    if (itemsError) throw itemsError;
  } catch (err) {
    // Best-effort rollback so we don't leave an empty basket behind.
    await supabase.from("basket_items").delete().eq("basket_id", basketId);
    await supabase.from("baskets").delete().eq("id", basketId);
    throw err;
  }

  const pantry = await syncPantry(customerId, dateOnly, resolvedItems);

  let receiptStored = null;
  if (receipt?.imagePath || receipt?.imageUrl) {
    receiptStored = await saveReceiptRecord({
      customerId,
      basketId,
      imagePath: receipt.imagePath,
      imageUrl: receipt.imageUrl,
      ocrText: receipt.ocrText,
      ocrDraft: receipt.ocrDraft,
      provider: receipt.provider,
    });
  }

  await supabase.from("activity_log").insert({
    customer_id: customerId,
    event_type: "purchase_recorded",
    metadata: {
      basket_id: basketId,
      store,
      purchase_date: dateOnly,
      item_count: resolvedItems.length,
      basket_total: resolvedItems.reduce((s, it) => s + Number(it.lineTotal || 0), 0),
    },
  });

  // Spending analytics derive month windows from this customer's latest basket.
  invalidateDatasetEnd(customerId);

  return {
    basketId,
    itemCount: resolvedItems.length,
    productsCreated,
    pantry,
    receiptStored: receiptStored?.storedIn || null,
  };
}

module.exports = { createPurchase, SUPPORTED_STORES };
