import { createClient } from "@supabase/supabase-js";
import { streamChat, type Msg, type Tier } from "@/lib/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = "You are ZOBAER AI, a personal AI operating assistant. Be concise and direct. You cannot yet take external actions (email, GitHub, deploy, browser); if asked, say that capability is not connected yet and never claim an action was done.";
const hits = new Map<string, number[]>(); // per-instance limiter; use Redis/Upstash for multi-instance
const limited = (id: string) => {
  const now = Date.now(), a = (hits.get(id) || []).filter((t) => now - t < 60_000);
  a.push(now); hits.set(id, a); return a.length > 20;
};

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (limited(user.id)) return new Response("Too many requests", { status: 429 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  const tier: Tier = ["fast", "balanced", "advanced"].includes(body.tier) ? body.tier : "balanced";
  const msgs: Msg[] = Array.isArray(body.messages) ? body.messages.slice(-40)
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 60_000) })) : [];
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return new Response("Invalid messages", { status: 400 });

  let convId: string | undefined = typeof body.conversationId === "string" ? body.conversationId : undefined;
  const last = msgs[msgs.length - 1].content;
  if (!convId) {
    const { data, error } = await sb.from("conversations")
      .insert({ user_id: user.id, title: (body.title || last).slice(0, 60) }).select("id").single();
    if (error) return new Response("DB error", { status: 500 });
    convId = data.id;
  }
  await sb.from("messages").insert({ conversation_id: convId, user_id: user.id, role: "user", content: last });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      let full = "";
      try {
        for await (const t of streamChat(msgs, tier, SYSTEM)) { full += t; ctrl.enqueue(enc.encode(t)); }
      } catch (e: any) {
        ctrl.enqueue(enc.encode(`\n\n[Error: ${e?.message || "AI request failed"}]`));
      }
      if (full) {
        await sb.from("messages").insert({ conversation_id: convId, user_id: user.id, role: "assistant", content: full });
        await sb.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "x-conversation-id": convId!, "cache-control": "no-store" } });
}
