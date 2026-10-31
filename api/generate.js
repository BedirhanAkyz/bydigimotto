// POST /api/generate { code, product, answers, computed } -> { ok, id, content }
// Marks the code as used, asks Claude for the personalised text, stores the planner.
const { sb, json, readBody, normCode } = require("./_lib");

const PRODUCT_BRIEF = {
  gym: "a 12-week gym program. Fields per week: focus (1 sentence), coaching_note (2 sentences, about effort and form for this person), nutrition_tip (1 sentence).",
  pregnancy: "a 40-week pregnancy planner. Fields per week: summary (2 sentences on baby and body), todos (3 short items), ask_doctor (2 questions), country_note (1-2 sentences specific to the buyer's country rules/paperwork), journal_prompt (1 question).",
  wedding: "a wedding countdown planner. Produce 12 monthly or weekly stages (depending on time left). Fields per stage: title, tasks (4 items), tip (1 sentence), budget_note (1 sentence).",
  baby: "a baby's-first-year planner. Fields per month (12): summary (2 sentences), todos (3), check_ups (country-specific, 1-2 items), journal_prompt (1).",
  puppy: "a new-puppy planner. Fields per week (16): training_focus (1 sentence), daily (3 items), health (1 item, breed and age appropriate), country_note (1 sentence).",
  garden: "a garden-year planner. Fields per month (12): sow (list), plant_out (list), harvest (list), jobs (3 items), note (1 sentence for this climate).",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, reason: "method" });
  try {
    const { code, product, answers, computed } = await readBody(req);
    const c = normCode(code).replace(/^#/, "");
    if (!PRODUCT_BRIEF[product]) return json(res, 400, { ok: false, reason: "product" });

    // 1) Atomically claim the code or order: only succeeds if used_at is still null.
    const isOrder = /^\d{8,12}$/.test(c);
    const table = isOrder ? "orders" : "codes", col = isOrder ? "order_id" : "code";
    const claimed = await sb(
      `${table}?${col}=eq.${encodeURIComponent(c)}&used_at=is.null`,
      { method: "PATCH", body: JSON.stringify({ used_at: new Date().toISOString() }) }
    );
    if (!claimed.length) return json(res, 200, { ok: false, reason: "used_or_notfound" });
    if (claimed[0].product !== "any" && claimed[0].product !== product) {
      await sb(`${table}?${col}=eq.${encodeURIComponent(c)}`, { method: "PATCH", body: JSON.stringify({ used_at: null }) });
      return json(res, 200, { ok: false, reason: "wrong_product", product: claimed[0].product });
    }

    // 2) Ask Claude for the personalised content as JSON.
    const prompt = `You write personalised planners sold by byDigiMotto. Write ${PRODUCT_BRIEF[product]}
Buyer's answers (JSON): ${JSON.stringify(answers)}
Pre-computed facts you must respect exactly (dates, numbers): ${JSON.stringify(computed || {})}
Rules: warm, specific, second person, use the buyer's names. No medical or legal claims beyond general guidance; add "check with your doctor/official source" where relevant. Never invent dates; use only the computed ones. Respond with ONLY a JSON object: {"units":[...]} where each unit is one week/month/stage with an "index" number and the fields listed. No markdown.`;

    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5-5",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const aiJson = await ai.json();
    if (!ai.ok) throw new Error("Anthropic: " + JSON.stringify(aiJson));
    const text = aiJson.content.map((p) => p.text || "").join("");
    let content;
    try { content = JSON.parse(text.replace(/^```json|```$/g, "").trim()); }
    catch { content = { raw: text }; }

    // 3) Store planner, link code.
    const [planner] = await sb("planners", {
      method: "POST",
      body: JSON.stringify({ code: isOrder ? null : c, order_id: isOrder ? c : null, product, answers: { ...answers, computed }, content }),
    });
    await sb(`${table}?${col}=eq.${encodeURIComponent(c)}`, { method: "PATCH", body: JSON.stringify({ planner_id: planner.id }) });

    return json(res, 200, { ok: true, id: planner.id, content });
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, reason: "server" });
  }
};
