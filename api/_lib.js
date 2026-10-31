// Shared helpers for serverless functions (Vercel Node runtime)
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;

async function sb(path, opts = {}) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  return data;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : {};
}

const normCode = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, "");

module.exports = { sb, json, readBody, normCode };
