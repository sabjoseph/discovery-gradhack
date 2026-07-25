const express = require("express");
const supabase = require("../config/supabase");
const { classifyFromLabel, getDatasetEndDate } = require("../utils/health");

const router = express.Router();

function retailerBucket(name) {
  const label = (name || "").toLowerCase();
  if (label.includes("checker")) return "checkers";
  if (label.includes("woolworth") || label.includes("woolies")) return "woolies";
  return "other";
}

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
    const datasetEnd = await getDatasetEndDate();
    const monthStart = new Date(datasetEnd);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [{ data: profile }, { data: monthBaskets, error: monthError }] =
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
            basket_items ( line_total )
          `
          )
          .eq("customer_id", customerId)
          .gte("purchase_date", monthStart.toISOString()),
      ]);

    if (monthError) throw monthError;

    let monthSpend = 0;
    let checkersSpend = 0;
    let wooliesSpend = 0;
    let otherSpend = 0;
    let basketCount = 0;

    for (const basket of monthBaskets || []) {
      basketCount += 1;
      let basketTotal = 0;
      for (const item of basket.basket_items || []) {
        basketTotal += Number(item.line_total || 0);
      }
      monthSpend += basketTotal;
      const bucket = retailerBucket(basket.retailers?.name);
      if (bucket === "checkers") checkersSpend += basketTotal;
      else if (bucket === "woolies") wooliesSpend += basketTotal;
      else otherSpend += basketTotal;
    }

    const budgetMonthly =
      profile?.budget_monthly != null ? Number(profile.budget_monthly) : null;
    const hasBudget = budgetMonthly != null && !Number.isNaN(budgetMonthly);
    const remaining = hasBudget ? budgetMonthly - monthSpend : null;
    const usedPct =
      hasBudget && budgetMonthly > 0
        ? Math.min(100, Math.round((monthSpend / budgetMonthly) * 100))
        : 0;

    res.json({
      success: true,
      data: {
        monthLabel: monthStart.toLocaleString("en-ZA", {
          month: "long",
          year: "numeric",
        }),
        datasetEnd: datasetEnd.toISOString(),
        budgetMonthly: hasBudget ? budgetMonthly : null,
        monthSpend,
        checkersSpend,
        wooliesSpend,
        otherSpend,
        remaining,
        usedPct,
        basketCount,
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
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
