const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.startsWith("eyJ")
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.RENDER_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Missing SUPABASE_URL or service role key");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
