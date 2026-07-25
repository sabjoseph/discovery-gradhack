const express = require("express");
const supabase = require("../config/supabase");
const { extractVouchers, withVouchers } = require("../utils/vouchers");
const {
  extractAllergies,
  withAllergies,
} = require("../utils/recipePersonalisation");
const { ALLERGEN_LABELS } = require("../data/allergens");
const {
  DIETARY_PREFERENCE_LABELS,
} = require("../utils/dietaryPreferences");

const router = express.Router();

const MAX_AVATAR_CHARS = 350_000; // ~resized jpeg data URL

// Body metrics + vouchers + avatar are stored as reserved objects inside health_goals jsonb
// so we don't need a schema migration:
//   { __metrics: true, age, weight_kg, height_cm }
//   { __vouchers: true, items: [...] }
//   { __avatar: true, dataUrl }
//   { __allergies: true, items: [...] }   // food allergies, kept apart from dietary_preferences
function extractAvatar(healthGoals) {
  const list = Array.isArray(healthGoals) ? healthGoals : [];
  const entry = list.find(
    (item) => item && typeof item === "object" && item.__avatar
  );
  const dataUrl = typeof entry?.dataUrl === "string" ? entry.dataUrl : null;
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
  return dataUrl;
}

function withAvatar(healthGoals, dataUrl) {
  const list = Array.isArray(healthGoals) ? [...healthGoals] : [];
  const filtered = list.filter(
    (item) => !(item && typeof item === "object" && item.__avatar)
  );
  if (dataUrl) {
    filtered.push({ __avatar: true, dataUrl });
  }
  return filtered;
}

function splitHealthGoals(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const metricsEntry = list.find(
    (item) => item && typeof item === "object" && item.__metrics
  );
  const goals = list.filter((item) => typeof item === "string");
  return {
    health_goals: goals,
    age: metricsEntry?.age ?? null,
    weight_kg: metricsEntry?.weight_kg ?? null,
    height_cm: metricsEntry?.height_cm ?? null,
    vouchers: extractVouchers(list),
    avatar_url: extractAvatar(list),
    allergies: extractAllergies(list),
  };
}

function mergeHealthGoals(
  goals,
  { age, weight_kg, height_cm, vouchers, avatar_url, allergies }
) {
  let list = Array.isArray(goals)
    ? goals.filter((item) => typeof item === "string")
    : [];
  const hasMetrics =
    age != null || weight_kg != null || height_cm != null;
  if (hasMetrics) {
    list.push({
      __metrics: true,
      age: age == null || age === "" ? null : Number(age),
      weight_kg:
        weight_kg == null || weight_kg === "" ? null : Number(weight_kg),
      height_cm:
        height_cm == null || height_cm === "" ? null : Number(height_cm),
    });
  }
  if (Array.isArray(vouchers) && vouchers.length) {
    list = withVouchers(list, vouchers);
  }
  if (avatar_url) {
    list = withAvatar(list, avatar_url);
  }
  list = withAllergies(list, allergies);
  return list;
}

function parseOptionalNumber(value, { min, max, label }) {
  if (value === "" || value == null) return { value: null };
  const n = Number(value);
  if (Number.isNaN(n)) {
    return { error: `${label} must be a number` };
  }
  if (min != null && n < min) {
    return { error: `${label} must be at least ${min}` };
  }
  if (max != null && n > max) {
    return { error: `${label} must be at most ${max}` };
  }
  return { value: n };
}

function calcBmi(weightKg, heightCm) {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

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

    const split = splitHealthGoals(profile?.health_goals);
    const weight = split.weight_kg;
    const height = split.height_cm;

    res.json({
      success: true,
      data: {
        customer,
        profile: {
          budget_monthly: profile?.budget_monthly ?? null,
          dietary_preferences: Array.isArray(profile?.dietary_preferences)
            ? profile.dietary_preferences.filter((x) => typeof x === "string")
            : [],
          allergies: split.allergies,
          health_goals: split.health_goals,
          age: split.age,
          weight_kg: weight,
          height_cm: height,
          bmi: calcBmi(weight, height),
          vouchers: split.vouchers,
          avatar_url: split.avatar_url,
          updated_at: profile?.updated_at ?? null,
        },
        notifications: notifications || {
          milestone_alerts: true,
          recommendation_nudges: true,
        },
        options: {
          dietary_preferences: DIETARY_PREFERENCE_LABELS,
          allergies: ALLERGEN_LABELS,
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
      allergies,
      health_goals,
      age,
      weight_kg,
      height_cm,
      milestone_alerts,
      recommendation_nudges,
      avatar_url,
    } = req.body || {};

    let budgetValue = null;
    if (budget_monthly !== "" && budget_monthly != null) {
      budgetValue = Number(budget_monthly);
      if (Number.isNaN(budgetValue)) {
        return res
          .status(400)
          .json({ success: false, message: "Budget must be a number" });
      }
      if (budgetValue < 0) {
        return res
          .status(400)
          .json({ success: false, message: "Budget cannot be negative" });
      }
    }

    const ageParsed = parseOptionalNumber(age, {
      min: 1,
      max: 120,
      label: "Age",
    });
    if (ageParsed.error) {
      return res.status(400).json({ success: false, message: ageParsed.error });
    }
    const weightParsed = parseOptionalNumber(weight_kg, {
      min: 20,
      max: 400,
      label: "Weight",
    });
    if (weightParsed.error) {
      return res.status(400).json({ success: false, message: weightParsed.error });
    }
    const heightParsed = parseOptionalNumber(height_cm, {
      min: 80,
      max: 250,
      label: "Height",
    });
    if (heightParsed.error) {
      return res.status(400).json({ success: false, message: heightParsed.error });
    }

    // Preserve existing vouchers; avatar comes from the request when provided.
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("health_goals")
      .eq("id", customerId)
      .maybeSingle();
    const existingVouchers = extractVouchers(existingProfile?.health_goals);
    const existingAvatar = extractAvatar(existingProfile?.health_goals);
    const existingAllergies = extractAllergies(existingProfile?.health_goals);
    // Only replace allergies when the client actually sends the field.
    const nextAllergies = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "allergies"
    )
      ? (Array.isArray(allergies) ? allergies : []).filter(
          (x) => typeof x === "string" && x.trim()
        )
      : existingAllergies;

    let nextAvatar = existingAvatar;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "avatar_url")) {
      if (avatar_url === null || avatar_url === "") {
        nextAvatar = null;
      } else if (typeof avatar_url !== "string" || !avatar_url.startsWith("data:image/")) {
        return res.status(400).json({
          success: false,
          message: "Avatar must be an image data URL",
        });
      } else if (avatar_url.length > MAX_AVATAR_CHARS) {
        return res.status(400).json({
          success: false,
          message: "Avatar image is too large — try a smaller photo",
        });
      } else {
        nextAvatar = avatar_url;
      }
    }

    const profilePayload = {
      id: customerId,
      budget_monthly: budgetValue,
      dietary_preferences: Array.isArray(dietary_preferences)
        ? dietary_preferences.filter((x) => typeof x === "string")
        : [],
      health_goals: mergeHealthGoals(health_goals, {
        age: ageParsed.value,
        weight_kg: weightParsed.value,
        height_cm: heightParsed.value,
        vouchers: existingVouchers,
        avatar_url: nextAvatar,
        allergies: nextAllergies,
      }),
      updated_at: new Date().toISOString(),
    };

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .upsert(profilePayload, { onConflict: "id" })
      .select()
      .single();

    if (profileError) throw profileError;

    const notifPayload = {
      customer_id: customerId,
      milestone_alerts: milestone_alerts ?? true,
      recommendation_nudges: recommendation_nudges ?? true,
      updated_at: new Date().toISOString(),
    };

    const { data: existingNotif } = await supabase
      .from("notification_preferences")
      .select("id")
      .eq("customer_id", customerId)
      .maybeSingle();

    let notifications;
    if (existingNotif) {
      const { data, error } = await supabase
        .from("notification_preferences")
        .update(notifPayload)
        .eq("customer_id", customerId)
        .select()
        .single();
      if (error) throw error;
      notifications = data;
    } else {
      const { data, error } = await supabase
        .from("notification_preferences")
        .insert(notifPayload)
        .select()
        .single();
      if (error) throw error;
      notifications = data;
    }

    const split = splitHealthGoals(profile.health_goals);

    res.json({
      success: true,
      data: {
        profile: {
          budget_monthly: profile.budget_monthly ?? null,
          dietary_preferences: Array.isArray(profile.dietary_preferences)
            ? profile.dietary_preferences.filter((x) => typeof x === "string")
            : [],
          allergies: split.allergies,
          health_goals: split.health_goals,
          age: split.age,
          weight_kg: split.weight_kg,
          height_cm: split.height_cm,
          bmi: calcBmi(split.weight_kg, split.height_cm),
          vouchers: split.vouchers,
          avatar_url: split.avatar_url,
          updated_at: profile.updated_at ?? null,
        },
        notifications,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
