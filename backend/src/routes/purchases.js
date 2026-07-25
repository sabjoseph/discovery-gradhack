const express = require("express");
const multer = require("multer");
const supabase = require("../config/supabase");
const { classifyFromLabel, getDatasetEndDate } = require("../utils/health");
const { extractReceipt } = require("../services/ocr");
const { uploadReceiptImage, getReceiptForBasket } = require("../services/receiptStorage");
const { createPurchase, SUPPORTED_STORES } = require("../services/purchaseService");
const {
  spendStatsForWindow,
  windowStartFor,
  SPEND_WINDOW_LABEL,
} = require("../utils/budgetMonth");

const router = express.Router();

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error("Unsupported file type. Use JPG, PNG, WEBP, HEIC or PDF."));
  },
});

function mapItem(item) {
  const cat = item.products?.categories;
  const nested = cat?.health_classifications;
  const label = Array.isArray(nested)
    ? nested[0]?.classification
    : nested?.classification;

  return {
    id: item.id,
    productId: item.product_id,
    name: item.products?.name || "Unknown product",
    quantity: item.quantity,
    unitPrice: item.unit_price,
    lineTotal: item.line_total,
    category: cat?.subcategory || "Uncategorised",
    mainCategory: cat?.main_category || null,
    healthTag: classifyFromLabel(label, cat?.main_category),
  };
}

// Step 1 of the add-purchase flow: upload a receipt image, run OCR, return an
// editable draft. The image is stored immediately so the saved purchase can
// link back to it.
router.post("/:customerId/receipt/parse", (req, res) => {
  upload.single("receipt")(req, res, async (uploadErr) => {
    try {
      if (uploadErr) {
        return res.status(400).json({ success: false, message: uploadErr.message });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: "No receipt file received." });
      }

      const { customerId } = req.params;
      const image = await uploadReceiptImage(customerId, req.file.buffer, req.file.mimetype);
      const { provider, rawText, draft } = await extractReceipt(req.file.buffer, req.file.mimetype);

      if (!draft.store && draft.unsupportedStore) {
        return res.status(422).json({
          success: false,
          code: "UNSUPPORTED_STORE",
          detectedStore: draft.unsupportedStore,
          message: "Only Checkers and Woolworths receipts are currently supported.",
        });
      }

      res.json({
        success: true,
        data: {
          provider,
          store: draft.store,
          purchaseDate: draft.purchaseDate,
          basketTotal: draft.basketTotal,
          items: draft.items || [],
          rawText,
          receiptImage: image,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
});

// Step 2: save the reviewed purchase. Creates basket + items, syncs the
// pantry, stores the receipt record and logs the activity.
router.post("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const { store, purchaseDate, items, receipt } = req.body || {};

    if (!SUPPORTED_STORES.includes(store)) {
      return res.status(422).json({
        success: false,
        code: "UNSUPPORTED_STORE",
        message: "Only Checkers and Woolworths receipts are currently supported.",
      });
    }
    if (!purchaseDate || Number.isNaN(new Date(purchaseDate).getTime())) {
      return res.status(400).json({ success: false, message: "A valid purchase date is required." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "At least one item is required." });
    }

    const cleanItems = [];
    for (const item of items) {
      const name = String(item?.name || "").trim();
      const quantity = Number(item?.quantity);
      const unitPrice = Number(item?.unitPrice);
      const lineTotal = Number(item?.lineTotal ?? quantity * unitPrice);
      if (!name) {
        return res.status(400).json({ success: false, message: "Every item needs a name." });
      }
      if (!(quantity > 0) || !(unitPrice >= 0) || !(lineTotal >= 0)) {
        return res.status(400).json({
          success: false,
          message: `Check quantity and price for "${name}".`,
        });
      }
      cleanItems.push({ name, quantity, unitPrice, lineTotal });
    }

    const result = await createPurchase({
      customerId,
      store,
      purchaseDate,
      items: cleanItems,
      receipt,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.get("/:customerId/meta", async (req, res) => {
  try {
    const { customerId } = req.params;

    const [{ data: retailers, error: retailerError }, { data: dates, error: dateError }] =
      await Promise.all([
        supabase.from("retailers").select("id, name").order("name"),
        supabase
          .from("baskets")
          .select("purchase_date, retailer_id")
          .eq("customer_id", customerId)
          .order("purchase_date", { ascending: false }),
      ]);

    if (retailerError) throw retailerError;
    if (dateError) throw dateError;

    const usedRetailerIds = new Set((dates || []).map((d) => d.retailer_id));
    const minDate = dates?.[dates.length - 1]?.purchase_date || null;
    const maxDate = dates?.[0]?.purchase_date || null;

    res.json({
      success: true,
      data: {
        retailers: (retailers || []).filter((r) => usedRetailerIds.has(r.id)),
        minDate,
        maxDate,
        basketCount: dates?.length || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:customerId/summary", async (req, res) => {
  try {
    const { customerId } = req.params;
    const datasetEnd = await getDatasetEndDate(customerId);

    // Rolling 30-day window ending at this customer's latest purchase, so the
    // summary always matches the receipts shown in "Recent".
    const windowStart = windowStartFor(datasetEnd);

    const [{ data: profile }, { data: recentBaskets, error: basketsError }] =
      await Promise.all([
        supabase
          .from("user_profiles")
          .select("budget_monthly")
          .eq("id", customerId)
          .maybeSingle(),
        supabase
          .from("baskets")
          .select(
            `
            purchase_date,
            retailers ( name ),
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
          .eq("customer_id", customerId)
          .gte("purchase_date", windowStart.toISOString()),
      ]);

    if (basketsError) throw basketsError;

    const active = spendStatsForWindow(recentBaskets, windowStart, datasetEnd);
    const healthMix = { healthy: 0, neutral: 0, unhealthy: 0, total: 0 };

    for (const basket of recentBaskets || []) {
      const purchaseDate = new Date(basket.purchase_date);
      if (purchaseDate < windowStart || purchaseDate > datasetEnd) continue;

      for (const item of basket.basket_items || []) {
        const category = item.products?.categories;
        const nested = category?.health_classifications;
        const classification = Array.isArray(nested)
          ? nested[0]?.classification
          : nested?.classification;
        const tag = classifyFromLabel(classification, category?.main_category);
        const amount = Number(item.line_total || 0);
        healthMix[tag] += amount;
        healthMix.total += amount;
      }
    }

    const healthMixWithPct = {
      ...healthMix,
      healthyPct: healthMix.total
        ? Math.round((healthMix.healthy / healthMix.total) * 100)
        : 0,
      neutralPct: healthMix.total
        ? Math.round((healthMix.neutral / healthMix.total) * 100)
        : 0,
      unhealthyPct: healthMix.total
        ? Math.round((healthMix.unhealthy / healthMix.total) * 100)
        : 0,
    };

    const budgetMonthly =
      profile?.budget_monthly != null ? Number(profile.budget_monthly) : null;
    const hasBudget = budgetMonthly != null && !Number.isNaN(budgetMonthly);
    const remaining = hasBudget ? budgetMonthly - active.monthSpend : null;
    const usedPct =
      hasBudget && budgetMonthly > 0
        ? Math.min(100, Math.round((active.monthSpend / budgetMonthly) * 100))
        : 0;

    res.json({
      success: true,
      data: {
        monthLabel: SPEND_WINDOW_LABEL,
        windowStart: windowStart.toISOString(),
        windowEnd: datasetEnd.toISOString(),
        datasetEnd: datasetEnd.toISOString(),
        budgetMonthly: hasBudget ? budgetMonthly : null,
        monthSpend: active.monthSpend,
        checkersSpend: active.checkersSpend,
        wooliesSpend: active.wooliesSpend,
        otherSpend: active.otherSpend,
        remaining,
        usedPct,
        basketCount: active.basketCount,
        healthMix: healthMixWithPct,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(5, Number(req.query.limit || 10)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const retailer = (req.query.retailer || "").trim();
    const fromDate = (req.query.from || "").trim();
    const toDate = (req.query.to || "").trim();

    let query = supabase
      .from("baskets")
      .select(
        `
        id,
        purchase_date,
        retailer_id,
        retailers ( id, name )
      `,
        { count: "exact" }
      )
      .eq("customer_id", customerId)
      .order("purchase_date", { ascending: false })
      .range(from, to);

    if (retailer) query = query.eq("retailer_id", retailer);
    if (fromDate) query = query.gte("purchase_date", fromDate);
    if (toDate) {
      const end = toDate.length === 10 ? `${toDate}T23:59:59.999Z` : toDate;
      query = query.lte("purchase_date", end);
    }

    const { data: baskets, error, count } = await query;
    if (error) throw error;

    const basketIds = (baskets || []).map((b) => b.id);
    let totalsByBasket = {};

    if (basketIds.length) {
      const { data: itemRows, error: itemsError } = await supabase
        .from("basket_items")
        .select("basket_id, line_total")
        .in("basket_id", basketIds);

      if (itemsError) throw itemsError;

      for (const row of itemRows || []) {
        if (!totalsByBasket[row.basket_id]) {
          totalsByBasket[row.basket_id] = { total: 0, itemCount: 0 };
        }
        totalsByBasket[row.basket_id].total += Number(row.line_total || 0);
        totalsByBasket[row.basket_id].itemCount += 1;
      }
    }

    const mapped = (baskets || []).map((basket) => ({
      id: basket.id,
      purchaseDate: basket.purchase_date,
      retailer: basket.retailers?.name || basket.retailer_id,
      retailerId: basket.retailer_id,
      itemCount: totalsByBasket[basket.id]?.itemCount || 0,
      total: totalsByBasket[basket.id]?.total || 0,
    }));

    res.json({
      success: true,
      data: mapped,
      pagination: {
        page,
        limit,
        total: count || 0,
        hasMore: from + mapped.length < (count || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:customerId/:basketId", async (req, res) => {
  try {
    const { customerId, basketId } = req.params;

    const { data: basket, error } = await supabase
      .from("baskets")
      .select(
        `
        id,
        purchase_date,
        retailer_id,
        customer_id,
        retailers ( id, name ),
        basket_items (
          id,
          quantity,
          unit_price,
          line_total,
          product_id,
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
      `
      )
      .eq("id", basketId)
      .eq("customer_id", customerId)
      .single();

    if (error) throw error;

    const items = (basket.basket_items || []).map(mapItem);
    const mix = { healthy: 0, neutral: 0, unhealthy: 0, total: 0 };
    for (const item of items) {
      const amount = Number(item.lineTotal || 0);
      mix[item.healthTag] += amount;
      mix.total += amount;
    }

    const receipt = await getReceiptForBasket(customerId, basketId).catch(() => null);

    res.json({
      success: true,
      data: {
        id: basket.id,
        purchaseDate: basket.purchase_date,
        retailer: basket.retailers?.name || basket.retailer_id,
        retailerId: basket.retailer_id,
        itemCount: items.length,
        total: mix.total,
        mix: {
          ...mix,
          healthyPct: mix.total ? Math.round((mix.healthy / mix.total) * 100) : 0,
          neutralPct: mix.total ? Math.round((mix.neutral / mix.total) * 100) : 0,
          unhealthyPct: mix.total
            ? Math.round((mix.unhealthy / mix.total) * 100)
            : 0,
        },
        items,
        receipt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
