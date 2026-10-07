export type Msg = { role: "user" | "assistant"; content: string };
export type Tier = "fast" | "balanced" | "advanced";
type Name = "gemini" | "openai" | "anthropic";

const DEFAULTS: Record<Name, Record<Tier, string>> = {
  gemini: { fast: "gemini-2.5-flash", balanced: "gemini-2.5-flash", advanced: "gemini-2.5-pro" },
  openai: { fast: "gpt-4o-mini", balanced: "gpt-4o", advanced: "gpt-4o" },
  anthropic: { fast: "claude-haiku-4-5-20251001", balanced: "claude-sonnet-5-5", advanced: "claude-opus-5-5" },
};
const KEYS: Record<Name, string> = { gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };
const model = (n: Name, t: Tier) => process.env[`MODEL_${n.toUpperCase()}_${t.toUpperCase()}`] || DEFAULTS[n][t];

async function* sse(res: Response): AsyncGenerator<any> {
  const reader = res.body!.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (d && d !== "[DONE]") { try { yield JSON.parse(d); } catch {} }
    }
  }
}

async function* run(n: Name, msgs: Msg[], tier: Tier, system: string): AsyncGenerator<string> {
  const key = process.env[KEYS[n]]!, m = model(n, tier);
  let res: Response;
  if (n === "openai") {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: m, stream: true, messages: [{ role: "system", content: system }, ...msgs] }),
    });
  } else if (n === "anthropic") {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: m, stream: true, max_tokens: 4096, system, messages: msgs }),
    });
  } else {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: msgs.map((x) => ({ role: x.role === "user" ? "user" : "model", parts: [{ text: x.content }] })),
      }),
    });
  }
  if (!res.ok || !res.body) throw new Error(`${n} error ${res.status}`);
  for await (const j of sse(res)) {
    const t = n === "openai" ? j.choices?.[0]?.delta?.content
      : n === "anthropic" ? (j.type === "content_block_delta" ? j.delta?.text : "")
      : j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (t) yield t;
  }
}

/** Provider-agnostic streaming with fallback (only before the first token is emitted). */
export async function* streamChat(msgs: Msg[], tier: Tier, system: string): AsyncGenerator<string> {
  const order = (process.env.AI_PROVIDERS || "gemini,openai,anthropic").split(",").map((s) => s.trim() as Name)
    .filter((n) => DEFAULTS[n] && process.env[KEYS[n]]);
  if (!order.length) throw new Error("No AI provider configured on the server.");
  let last: unknown;
  for (const n of order) {
    let started = false;
    try { for await (const t of run(n, msgs, tier, system)) { started = true; yield t; } return; }
    catch (e) { last = e; if (started) throw e; }
  }
  throw last;
}
