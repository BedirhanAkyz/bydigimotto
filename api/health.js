// GET /api/health -> env presence + Supabase reachability (no secrets returned)
const { sb, json } = require("./_lib");
module.exports = async (req, res) => {
  const env = { SUPABASE_URL: !!process.env.SUPABASE_URL, SUPABASE_KEY: !!process.env.SUPABASE_KEY, ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY, keyType: (process.env.SUPABASE_KEY||"").slice(0,9) };
  try { const rows = await sb("codes?select=code&limit=1"); return json(res, 200, { ok: true, env, codes: rows.length }); }
  catch (e) { return json(res, 200, { ok: false, env, error: String(e.message).slice(0, 300) }); }
};
