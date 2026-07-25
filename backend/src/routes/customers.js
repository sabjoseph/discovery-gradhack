const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

function nextCustomerId(existing = []) {
  let max = 0;
  for (const row of existing) {
    const match = String(row.id || "").match(/^CUST-(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `CUST-${String(max + 1).padStart(3, "0")}`;
}

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

router.post("/", async (req, res) => {
  try {
    const firstName = String(req.body?.firstName || "").trim();
    const surname = String(req.body?.surname || "").trim();

    if (!firstName || !surname) {
      return res.status(400).json({
        success: false,
        message: "First name and surname are required",
      });
    }

    if (firstName.length > 60 || surname.length > 60) {
      return res.status(400).json({
        success: false,
        message: "Names must be 60 characters or less",
      });
    }

    const fullName = `${firstName} ${surname}`.replace(/\s+/g, " ").trim();

    const { data: existing, error: listError } = await supabase
      .from("customers")
      .select("id, name");

    if (listError) throw listError;

    const duplicate = (existing || []).find(
      (row) => String(row.name || "").toLowerCase() === fullName.toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "That name is already registered — search for it instead",
        data: duplicate,
      });
    }

    const id = nextCustomerId(existing);
    const { data, error } = await supabase
      .from("customers")
      .insert({
        id,
        name: fullName,
      })
      .select("id, name, created_at")
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data });
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
