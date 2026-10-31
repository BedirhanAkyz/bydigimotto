// GET /api/etsy-status?token=ADMIN_TOKEN -> checks the Etsy connection, fills shop_id if missing
const { sb, json } = require("./_lib");
const { accessToken, apiKey } = require("./_etsy");
module.exports = async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.searchParams.get("token") !== process.env.ADMIN_TOKEN) return json(res, 401, { ok: false });
  try {
    const a = await accessToken();
    const H = { "x-api-key": apiKey(), Authorization: `Bearer ${a.access_token}` };
    const me = await fetch("https://openapi.etsy.com/v3/application/users/me", { headers: H }).then(x => x.json());
    let shop_id = me.shop_id || a.shop_id, shop_name = a.shop_name;
    if (!shop_id && me.user_id) {
      const s = await fetch(`https://openapi.etsy.com/v3/application/users/${me.user_id}/shops`, { headers: H }).then(x => x.json());
      shop_id = s.shop_id; shop_name = s.shop_name;
    }
    if (shop_id) {
      const sh = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}`, { headers: H }).then(x => x.json());
      shop_name = sh.shop_name || shop_name;
      await sb("settings?key=eq.etsy_auth", { method: "PATCH", body: JSON.stringify({ value: { ...a, shop_id, shop_name } }) });
    }
    // try listing the latest receipt as a connectivity test
    let receipts = null;
    if (shop_id) { const r = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/receipts?limit=1`, { headers: H }); receipts = { status: r.status, body: (await r.text()).slice(0, 300) }; }
    return json(res, 200, { ok: !!shop_id, me, shop_id, shop_name, receipts });
  } catch (e) { return json(res, 500, { ok: false, error: String(e.message).slice(0, 300) }); }
};
