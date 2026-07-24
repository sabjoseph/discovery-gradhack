const express = require("express");
const supabase = require("../supabase");
const { classifyCategory, daysUntilFrom, getDatasetEndDate } = require("../utils/health");

const router = express.Router();

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const { data, error } = await supabase
      .from("pantry_items")
      .select(
        `
        id,
        quantity_remaining,
        added_date,
        expiry_estimate,
        product_id,
        products (
          id,
          name,
          category_id,
          categories ( id, main_category, subcategory )
        )
      `
      )
      .eq("customer_id", customerId)
      .gt("quantity_remaining", 0)
      .order("expiry_estimate", { ascending: true });

    if (error) throw error;

    const datasetEnd = await getDatasetEndDate();
    const items = (data || []).map((row) => {
      const daysLeft = daysUntilFrom(row.expiry_estimate, datasetEnd);
      return {
        id: row.id,
        productId: row.product_id,
        name: row.products?.name || "Unknown product",
        quantity: Number(row.quantity_remaining),
        addedDate: row.added_date,
        expiryEstimate: row.expiry_estimate,
        daysLeft,
        expiringSoon: daysLeft !== null && daysLeft <= 7,
        expired: daysLeft !== null && daysLeft < 0,
        category: row.products?.categories?.subcategory || "Uncategorised",
        mainCategory: row.products?.categories?.main_category || null,
        categoryId: row.products?.category_id || row.products?.categories?.id,
        healthTag: classifyCategory(row.products?.categories?.main_category),
      };
    });

    res.json({
      success: true,
      data: {
        items,
        count: items.length,
        expiringSoonCount: items.filter((i) => i.expiringSoon && !i.expired)
          .length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/:customerId/:itemId/use", async (req, res) => {
  try {
    const { customerId, itemId } = req.params;
    const amount = Number(req.body?.amount ?? 1);

    const { data: item, error: fetchError } = await supabase
      .from("pantry_items")
      .select("id, quantity_remaining")
      .eq("id", itemId)
      .eq("customer_id", customerId)
      .single();

    if (fetchError) throw fetchError;

    const nextQty = Math.max(0, Number(item.quantity_remaining) - amount);

    const { data: updated, error: updateError } = await supabase
      .from("pantry_items")
      .update({ quantity_remaining: nextQty })
      .eq("id", itemId)
      .eq("customer_id", customerId)
      .select()
      .single();

    if (updateError) throw updateError;

    await supabase.from("activity_log").insert({
      customer_id: customerId,
      event_type: "pantry_used",
      metadata: { pantry_item_id: Number(itemId), amount, quantity_remaining: nextQty },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
