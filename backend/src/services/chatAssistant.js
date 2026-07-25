const supabase = require("../config/supabase");

const MAX_REQUESTS_PER_MINUTE = 12;
const rateLimits = new Map();

function checkRateLimit(customerId) {
  const now = Date.now();
  const entry = rateLimits.get(customerId);

  if (!entry || now >= entry.resetAt) {
    rateLimits.set(customerId, { count: 1, resetAt: now + 60_000 });
    return null;
  }

  if (entry.count >= MAX_REQUESTS_PER_MINUTE) {
    return "Too many requests — please wait a moment and try again.";
  }

  entry.count += 1;
  rateLimits.set(customerId, entry);
  return null;
}

async function verifySessionToken(customerId, token) {
  const { data, error } = await supabase
    .from("customer_sessions")
    .select("customer_id")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("customer_sessions lookup failed:", error.message);
    throw new Error("Could not verify session.");
  }

  if (!data) return false;
  return String(data.customer_id) === String(customerId);
}

function formatDateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function mapPantryItem(row) {
  return {
    id: row.id,
    name: row.products?.name || "Unknown product",
    quantity_remaining: row.quantity_remaining,
    added_date: formatDateOnly(row.added_date),
    expiry_estimate: formatDateOnly(row.expiry_estimate),
    category: row.products?.categories?.subcategory || null,
    main_category: row.products?.categories?.main_category || null,
  };
}

function mapPurchaseItem(row) {
  const cat = row.products?.categories;
  const nested = cat?.health_classifications;
  const classification = Array.isArray(nested)
    ? nested[0]?.classification
    : nested?.classification;

  return {
    name: row.products?.name || "Unknown product",
    quantity: row.quantity,
    unit_price: row.unit_price,
    line_total: row.line_total,
    category: cat?.subcategory || null,
    main_category: cat?.main_category || null,
    health_classification: classification || null,
  };
}

async function getDatasetEndDate(customerId) {
  let query = supabase
    .from("baskets")
    .select("purchase_date")
    .order("purchase_date", { ascending: false })
    .limit(1);
  if (customerId) query = query.eq("customer_id", customerId);

  const { data, error } = await query;

  if (error) {
    console.error("dataset end date lookup failed:", error.message);
    return new Date();
  }

  return data?.[0]?.purchase_date
    ? new Date(data[0].purchase_date)
    : new Date();
}

async function fetchCustomerContext(customerId) {
  const endDate = await getDatasetEndDate(customerId);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 30);
  const startIso = startDate.toISOString().slice(0, 10);
  const endIso = endDate.toISOString().slice(0, 10);

  const pantryResult = await supabase
    .from("pantry_items")
    .select(
      `
      id,
      quantity_remaining,
      added_date,
      expiry_estimate,
      products (
        name,
        categories ( main_category, subcategory )
      )
    `
    )
    .eq("customer_id", customerId)
    .gt("quantity_remaining", 0)
    .order("expiry_estimate", { ascending: true });

  if (pantryResult.error) {
    console.error("pantry_items query failed:", pantryResult.error.message);
    throw pantryResult.error;
  }

  const basketsResult = await supabase
    .from("baskets")
    .select(
      `
      id,
      purchase_date,
      basket_items (
        quantity,
        unit_price,
        line_total,
        products (
          name,
          categories (
            main_category,
            subcategory,
            health_classifications ( classification )
          )
        )
      )
    `
    )
    .eq("customer_id", customerId)
    .gte("purchase_date", startIso)
    .lte("purchase_date", endIso)
    .order("purchase_date", { ascending: false });

  if (basketsResult.error) {
    console.error("baskets query failed:", basketsResult.error.message);
    throw basketsResult.error;
  }

  const recipesResult = await supabase
    .from("recipes")
    .select(
      `
      id,
      name,
      instructions,
      prep_time_minutes,
      health_score,
      source,
      servings,
      recipe_ingredients (
        id,
        ingredient_name,
        product_id,
        category_id,
        quantity_required,
        unit
      )
    `
    )
    .order("name");

  if (recipesResult.error) {
    console.error("recipes query failed:", recipesResult.error.message);
    throw recipesResult.error;
  }

  const profileResult = await supabase
    .from("user_profiles")
    .select("budget_monthly, dietary_preferences, health_goals")
    .eq("id", customerId)
    .maybeSingle();

  if (profileResult.error) {
    console.error("user_profiles query failed:", profileResult.error.message);
    throw profileResult.error;
  }

  const pantry = (pantryResult.data || []).map(mapPantryItem);
  const purchases = (basketsResult.data || []).flatMap((basket) =>
    (basket.basket_items || []).map((item) => ({
      purchase_date: formatDateOnly(basket.purchase_date),
      ...mapPurchaseItem(item),
    }))
  );

  const recipes = (recipesResult.data || []).map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    instructions: recipe.instructions,
    prep_time_minutes: recipe.prep_time_minutes,
    health_score: recipe.health_score,
    source: recipe.source,
    servings: recipe.servings,
    ingredients: recipe.recipe_ingredients || [],
  }));

  const profile = profileResult.data;
  const healthGoals = Array.isArray(profile?.health_goals)
    ? profile.health_goals.filter((item) => typeof item === "string")
    : [];

  return {
    pantry,
    purchases,
    recipes,
    profile: {
      budget_monthly: profile?.budget_monthly ?? null,
      dietary_preferences: Array.isArray(profile?.dietary_preferences)
        ? profile.dietary_preferences
        : [],
      health_goals: healthGoals,
    },
  };
}

function buildSystemPrompt(context) {
  const budget =
    context.profile.budget_monthly == null
      ? "not set"
      : `R${context.profile.budget_monthly} per month`;

  return `You are the BiteBetter assistant, a friendly leaf character helping this customer make the most of what they've already bought. Only use the real data provided below to answer — never invent recipes, products, or prices that aren't listed. If you don't have enough information to answer, say so plainly and suggest which page of the app (Pantry, Recipes, Purchases) would have it. Keep replies concise, warm, and practical.

CUSTOMER'S CURRENT PANTRY:
${JSON.stringify(context.pantry, null, 2)}

AVAILABLE RECIPES:
${JSON.stringify(context.recipes, null, 2)}

RECENT PURCHASES (last 30 days):
${JSON.stringify(context.purchases, null, 2)}

DIETARY PREFERENCES:
${JSON.stringify(context.profile.dietary_preferences, null, 2)}

HEALTH GOALS:
${JSON.stringify(context.profile.health_goals, null, 2)}

BUDGET: ${budget}`;
}

async function callOpenAI(systemPrompt, message, conversationHistory = []) {
  const apiKey = (process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured on the server."
    );
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory
      .filter((entry) => entry.role === "user" || entry.role === "assistant")
      .slice(-8)
      .map((entry) => ({ role: entry.role, content: entry.content })),
    { role: "user", content: message },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 500,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI API error:", response.status, errorText);
    throw new Error(`OpenAI request failed (${response.status}).`);
  }

  const payload = await response.json();
  const reply = payload?.choices?.[0]?.message?.content;
  if (!reply || typeof reply !== "string") {
    throw new Error("OpenAI returned an empty response.");
  }

  return reply.trim();
}

async function handleChatAssistantRequest(body) {
  const customerId = String(body.customerId || "").trim();
  const token = String(body.token || "").trim();
  const message = String(body.message || "").trim();
  const conversationHistory = Array.isArray(body.conversationHistory)
    ? body.conversationHistory
    : [];

  if (!customerId) {
    return { status: 400, body: { error: "customerId is required" } };
  }

  if (!token) {
    return { status: 403, body: { error: "token is required" } };
  }

  if (!message) {
    return { status: 400, body: { error: "message is required" } };
  }

  if (message.length > 500) {
    return { status: 400, body: { error: "message is too long" } };
  }

  const sessionOk = await verifySessionToken(customerId, token);
  if (!sessionOk) {
    return { status: 403, body: { error: "Invalid session token for this customer" } };
  }

  const rateError = checkRateLimit(customerId);
  if (rateError) {
    return { status: 429, body: { error: rateError } };
  }

  const context = await fetchCustomerContext(customerId);
  const systemPrompt = buildSystemPrompt(context);

  const { error: logError } = await supabase.from("activity_log").insert({
    customer_id: customerId,
    event_type: "chatbot_question",
    metadata: { question: message },
  });

  if (logError) {
    console.error("activity_log insert failed:", logError.message);
  }

  const reply = await callOpenAI(systemPrompt, message, conversationHistory);
  return { status: 200, body: { reply } };
}

module.exports = {
  handleChatAssistantRequest,
};
