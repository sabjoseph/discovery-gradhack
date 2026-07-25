const express = require("express");
const supabase = require("../supabase");
const { classifyCategory } = require("../utils/health");

const router = express.Router();

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const { data: baskets, error } = await supabase
      .from("baskets")
      .select(
        `
        id,
        purchase_date,
        retailer_id,
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
            categories ( id, main_category, subcategory )
          )
        )
      `
      )
      .eq("customer_id", customerId)
      .order("purchase_date", { ascending: false });

    if (error) throw error;

    const mapped = (baskets || []).map((basket) => {
      const items = (basket.basket_items || []).map((item) => {
        const cat = item.products?.categories;
        return {
          id: item.id,
          productId: item.product_id,
          name: item.products?.name || "Unknown product",
          quantity: item.quantity,
          unitPrice: item.unit_price,
          lineTotal: item.line_total,
          category: cat?.subcategory || "Uncategorised",
          mainCategory: cat?.main_category || null,
          healthTag: classifyCategory(cat?.main_category),
        };
      });

      const total = items.reduce((sum, i) => sum + Number(i.lineTotal || 0), 0);

      return {
        id: basket.id,
        purchaseDate: basket.purchase_date,
        retailer: basket.retailers?.name || basket.retailer_id,
        itemCount: items.length,
        total,
        items,
      };
    });

    res.json({ success: true, data: mapped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
