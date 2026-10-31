// Etsy helper: valid access token (auto-refresh) + receipt lookup
const { sb } = require("./_lib");
const apiKey = () => process.env.ETSY_SECRET ? `${process.env.ETSY_KEYSTRING}:${process.env.ETSY_SECRET}` : process.env.ETSY_KEYSTRING;
async function accessToken() {
  const [row] = await sb("settings?key=eq.etsy_auth&select=value");
  if (!row) throw new Error("etsy_not_connected");
  let a = row.value;
  if (Date.now() > a.expires_at) {
    const r = await fetch("https://api.etsy.com/v3/public/oauth/token", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", client_id: process.env.ETSY_KEYSTRING, refresh_token: a.refresh_token }) });
    const t = await r.json(); if (!r.ok) throw new Error("etsy_refresh: " + JSON.stringify(t));
    a = { ...a, access_token: t.access_token, refresh_token: t.refresh_token || a.refresh_token, expires_at: Date.now() + (t.expires_in - 60) * 1000 };
    await sb("settings?key=eq.etsy_auth", { method: "PATCH", body: JSON.stringify({ value: a, updated_at: new Date().toISOString() }) });
  }
  return a;
}
async function getReceipt(receiptId) {
  const a = await accessToken();
  const r = await fetch(`https://openapi.etsy.com/v3/application/shops/${a.shop_id}/receipts/${receiptId}`, { headers: { "x-api-key": apiKey(), Authorization: `Bearer ${a.access_token}` } });
  if (r.status === 404) return null;
  const j = await r.json(); if (!r.ok) throw new Error("etsy_receipt: " + JSON.stringify(j).slice(0, 200));
  return j;
}
async function productFor(titles) {
  const products = await sb("products?select=key,match");
  const t = titles.join(" | ").toLowerCase();
  const p = products.find(x => t.includes(x.match));
  return p ? p.key : "other";
}
module.exports = { accessToken, getReceipt, productFor, apiKey };
