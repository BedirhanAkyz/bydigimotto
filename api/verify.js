// POST /api/verify { code }  code = Etsy order (receipt) number or a DM- code
// -> { ok, product } | { ok:false, reason, ... }
const { sb, json, readBody, normCode } = require("./_lib");
const { getReceipt, productFor } = require("./_etsy");

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, reason: "method" });
  try {
    const { code } = await readBody(req);
    const c = normCode(code).replace(/^#/, "");
    if (/^DM-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) {
      const rows = await sb(`codes?code=eq.${encodeURIComponent(c)}&select=code,product,used_at,planner_id`);
      if (!rows.length) return json(res, 200, { ok: false, reason: "notfound" });
      if (rows[0].used_at) return json(res, 200, { ok: false, reason: "used", used_at: rows[0].used_at, planner_id: rows[0].planner_id });
      return json(res, 200, { ok: true, product: rows[0].product, kind: "code" });
    }
    if (!/^\d{8,12}$/.test(c)) return json(res, 200, { ok: false, reason: "format" });
    let rows = await sb(`orders?order_id=eq.${c}&select=order_id,product,used_at,planner_id`);
    if (!rows.length) {
      // Live lookup in the shop's Etsy receipts
      let rc = null;
      try { rc = await getReceipt(c); } catch (e) { console.error(e); return json(res, 200, { ok: false, reason: "etsy_unavailable" }); }
      if (!rc) return json(res, 200, { ok: false, reason: "notfound" });
      const titles = (rc.transactions || []).map(t => t.title || "");
      const product = await productFor(titles);
      await sb("orders?on_conflict=order_id", { method: "POST", prefer: "resolution=ignore-duplicates,return=representation",
        body: JSON.stringify({ order_id: c, product, buyer: rc.name || null, email: rc.buyer_email || null, listing: titles.join(" | "), sale_date: rc.create_timestamp ? new Date(rc.create_timestamp * 1000).toISOString() : null }) });
      rows = [{ order_id: c, product, used_at: null }];
    }
    const o = rows[0];
    if (o.product === "other") return json(res, 200, { ok: false, reason: "no_planner" });
    if (o.used_at) return json(res, 200, { ok: false, reason: "used", used_at: o.used_at, planner_id: o.planner_id });
    return json(res, 200, { ok: true, product: o.product, kind: "order" });
  } catch (e) { console.error(e); return json(res, 500, { ok: false, reason: "server" }); }
};
