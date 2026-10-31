// Admin endpoints, protected by ADMIN_TOKEN (set in Vercel env).
// POST /api/admin?op=import   body: { csv }      -> imports Etsy "Sold Orders" CSV rows
// GET  /api/admin?op=list                       -> recent orders + stats
// POST /api/admin?op=reset    body: { order_id } -> clears used_at so the buyer can regenerate
// POST /api/admin?op=add      body: { order_id, product } -> manual add
const { sb, json, readBody } = require("./_lib");

function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

module.exports = async (req, res) => {
  const token = req.headers["x-admin-token"] || new URL(req.url, "http://x").searchParams.get("token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) return json(res, 401, { ok: false, reason: "auth" });
  const op = new URL(req.url, "http://x").searchParams.get("op");
  try {
    if (op === "list") {
      const orders = await sb("orders?select=order_id,product,buyer,listing,sale_date,used_at,email,created_at&order=created_at.desc&limit=200");
      const wait = await sb("waitlist?select=order_id,email,notified_at&notified_at=is.null");
      return json(res, 200, { ok: true, orders, waiting: wait });
    }
    const body = await readBody(req);
    if (op === "reset") {
      await sb(`orders?order_id=eq.${encodeURIComponent(body.order_id)}`, { method: "PATCH", body: JSON.stringify({ used_at: null, planner_id: null }) });
      return json(res, 200, { ok: true });
    }
    if (op === "add") {
      await sb("orders", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: JSON.stringify({ order_id: String(body.order_id).trim(), product: body.product || "other" }) });
      return json(res, 200, { ok: true });
    }
    if (op === "import") {
      const rows = parseCSV(body.csv || "");
      if (rows.length < 2) return json(res, 400, { ok: false, reason: "empty" });
      const head = rows[0].map(h => h.trim().toLowerCase());
      const col = (names) => head.findIndex(h => names.some(n => h === n || h.includes(n)));
      const iOrder = col(["order id", "order_id", "transaction id"]);
      const iTitle = col(["item name", "title", "listing"]);
      const iBuyer = col(["buyer", "full name", "ship name"]);
      const iDate = col(["sale date", "date"]);
      if (iOrder < 0) return json(res, 400, { ok: false, reason: "no_order_column", head });
      const products = await sb("products?select=key,match");
      const items = [];
      for (const r of rows.slice(1)) {
        const order_id = (r[iOrder] || "").trim(); if (!order_id) continue;
        const title = ((iTitle >= 0 ? r[iTitle] : "") || "").toLowerCase();
        const p = products.find(x => title.includes(x.match));
        items.push({ order_id, product: p ? p.key : "other", listing: iTitle >= 0 ? r[iTitle] : null, buyer: iBuyer >= 0 ? r[iBuyer] : null, sale_date: iDate >= 0 ? r[iDate] : null });
      }
      // upsert, ignore existing (keeps used_at)
      const inserted = await sb("orders?on_conflict=order_id", { method: "POST", prefer: "resolution=ignore-duplicates,return=representation", body: JSON.stringify(items) });
      // notify waiting buyers whose order just arrived
      const wait = await sb("waitlist?select=id,order_id,email&notified_at=is.null");
      const now = new Set(items.map(i => i.order_id));
      const toNotify = wait.filter(w => now.has(w.order_id));
      for (const w of toNotify) {
        if (process.env.RESEND_API_KEY) {
          await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: process.env.MAIL_FROM || "byDigiMotto <hello@bydigimotto.com>", to: w.email, subject: "Your planner is ready to create", html: `<p>Your Etsy order <b>${w.order_id}</b> is now active.</p><p><a href="https://bydigimotto.com/?order=${w.order_id}">Create your planner</a></p>` }) });
        }
        await sb(`waitlist?id=eq.${w.id}`, { method: "PATCH", body: JSON.stringify({ notified_at: new Date().toISOString() }) });
      }
      return json(res, 200, { ok: true, parsed: items.length, inserted: inserted.length, planners: items.filter(i => i.product !== "other").length, notified: toNotify.length });
    }
    return json(res, 400, { ok: false, reason: "op" });
  } catch (e) { console.error(e); return json(res, 500, { ok: false, reason: "server", error: String(e.message).slice(0, 200) }); }
};
