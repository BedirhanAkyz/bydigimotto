// GET /api/etsy-callback?code=...&state=... -> exchanges code, stores refresh token + shop id
const { sb, json } = require("./_lib");
module.exports = async (req, res) => {
  const u = new URL(req.url, "http://x");
  const code = u.searchParams.get("code"), state = u.searchParams.get("state");
  try {
    const [pk] = await sb("settings?key=eq.etsy_pkce&select=value");
    if (!pk || pk.value.state !== state) return json(res, 400, { ok: false, reason: "state" });
    const redirect = `https://${req.headers.host}/api/etsy-callback`;
    const r = await fetch("https://api.etsy.com/v3/public/oauth/token", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", client_id: process.env.ETSY_KEYSTRING, redirect_uri: redirect, code, code_verifier: pk.value.verifier }) });
    const tok = await r.json();
    if (!r.ok) return json(res, 500, { ok: false, etsy: tok });
    const userId = String(tok.access_token).split(".")[0];
    const me = await fetch(`https://openapi.etsy.com/v3/application/users/${userId}/shops`, { headers: { "x-api-key": process.env.ETSY_KEYSTRING, Authorization: `Bearer ${tok.access_token}` } }).then(x => x.json());
    const shop_id = me.shop_id || (me.results && me.results[0] && me.results[0].shop_id);
    await sb("settings", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: JSON.stringify({ key: "etsy_auth", value: { refresh_token: tok.refresh_token, access_token: tok.access_token, expires_at: Date.now() + (tok.expires_in - 60) * 1000, shop_id, shop_name: me.shop_name || (me.results && me.results[0] && me.results[0].shop_name) } }) });
    res.statusCode = 200; res.setHeader("Content-Type", "text/html");
    res.end(`<p style="font-family:sans-serif">Etsy connected: shop <b>${me.shop_name || shop_id}</b>. You can close this tab.</p>`);
  } catch (e) { console.error(e); return json(res, 500, { ok: false, error: String(e.message).slice(0, 200) }); }
};
