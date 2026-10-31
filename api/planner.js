// GET /api/planner?id=<uuid> -> stored planner (for "open my planner" links)
const { sb, json } = require("./_lib");
module.exports = async (req, res) => {
  try {
    const id = new URL(req.url, "http://x").searchParams.get("id") || "";
    if (!/^[0-9a-f-]{36}$/.test(id)) return json(res, 400, { ok: false });
    const rows = await sb(`planners?id=eq.${id}&select=id,product,answers,content,created_at`);
    if (!rows.length) return json(res, 404, { ok: false });
    return json(res, 200, { ok: true, planner: rows[0] });
  } catch (e) { console.error(e); return json(res, 500, { ok: false }); }
};
