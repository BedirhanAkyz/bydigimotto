// POST /api/verify  { code }  -> { ok, product } | { ok:false, reason }
const { sb, json, readBody, normCode } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, reason: "method" });
  try {
    const { code } = await readBody(req);
    const c = normCode(code);
    if (!/^DM-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) return json(res, 200, { ok: false, reason: "format" });
    const rows = await sb(`codes?code=eq.${encodeURIComponent(c)}&select=code,product,used_at,planner_id`);
    if (!rows.length) return json(res, 200, { ok: false, reason: "notfound" });
    const row = rows[0];
    if (row.used_at) return json(res, 200, { ok: false, reason: "used", used_at: row.used_at, planner_id: row.planner_id });
    return json(res, 200, { ok: true, product: row.product });
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, reason: "server" });
  }
};
