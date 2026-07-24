const express = require("express");
const supabase = require("../supabase");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    let query = supabase
      .from("customers")
      .select("id, name, created_at")
      .order("name", { ascending: true });

    if (q) {
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, created_at")
      .eq("id", req.params.id)
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

module.exports = router;
