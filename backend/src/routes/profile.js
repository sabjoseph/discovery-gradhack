const express = require("express");
const supabase = require("../supabase");

const router = express.Router();

router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    const [{ data: customer }, { data: profile }, { data: notifications }] =
      await Promise.all([
        supabase
          .from("customers")
          .select("id, name")
          .eq("id", customerId)
          .single(),
        supabase
          .from("user_profiles")
          .select("budget_monthly, dietary_preferences, health_goals, updated_at")
          .eq("id", customerId)
          .maybeSingle(),
        supabase
          .from("notification_preferences")
          .select("milestone_alerts, recommendation_nudges, updated_at")
          .eq("customer_id", customerId)
          .maybeSingle(),
      ]);

    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    res.json({
      success: true,
      data: {
        customer,
        profile: profile || {
          budget_monthly: null,
          dietary_preferences: [],
          health_goals: [],
        },
        notifications: notifications || {
          milestone_alerts: true,
          recommendation_nudges: true,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const {
      budget_monthly,
      dietary_preferences,
      health_goals,
      milestone_alerts,
      recommendation_nudges,
    } = req.body || {};

    const profilePayload = {
      id: customerId,
      budget_monthly:
        budget_monthly === "" || budget_monthly == null
          ? null
          : Number(budget_monthly),
      dietary_preferences: dietary_preferences ?? [],
      health_goals: health_goals ?? [],
      updated_at: new Date().toISOString(),
    };

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .upsert(profilePayload)
      .select()
      .single();

    if (profileError) throw profileError;

    const { data: existingNotif } = await supabase
      .from("notification_preferences")
      .select("id")
      .eq("customer_id", customerId)
      .maybeSingle();

    let notifications;
    if (existingNotif) {
      const { data, error } = await supabase
        .from("notification_preferences")
        .update({
          milestone_alerts: milestone_alerts ?? true,
          recommendation_nudges: recommendation_nudges ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq("customer_id", customerId)
        .select()
        .single();
      if (error) throw error;
      notifications = data;
    } else {
      const { data, error } = await supabase
        .from("notification_preferences")
        .insert({
          customer_id: customerId,
          milestone_alerts: milestone_alerts ?? true,
          recommendation_nudges: recommendation_nudges ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      notifications = data;
    }

    res.json({
      success: true,
      data: { profile, notifications },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
