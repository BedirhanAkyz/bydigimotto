// GET /api/etsy-connect?token=ADMIN_TOKEN -> redirects to Etsy OAuth (PKCE). One-time setup by the shop owner.
const crypto = require("crypto");
const { sb, json } = require("./_lib");
module.exports = async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.searchParams.get("token") !== process.env.ADMIN_TOKEN) return json(res, 401, { ok: false });
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(12).toString("hex");
  await sb("settings", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: JSON.stringify({ key: "etsy_pkce", value: { verifier, state } }) });
  const redirect = `https://${req.headers.host}/api/etsy-callback`;
  const url = `https://www.etsy.com/oauth/connect?response_type=code&client_id=${process.env.ETSY_KEYSTRING}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent("transactions_r email_r shops_r")}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
  res.statusCode = 302; res.setHeader("Location", url); res.end();
};
