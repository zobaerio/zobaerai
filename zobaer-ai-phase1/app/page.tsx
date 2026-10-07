"use client";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type M = { role: "user" | "assistant"; content: string };
type C = { id: string; title: string };
const TEXT_EXT = /\.(txt|md|csv|json|ts|tsx|js|py|html|css|sql|log)$/i;

export default function Home() {
  const [s, setS] = useState<Session | null>(null), [ready, setReady] = useState(false);
  const [convs, setConvs] = useState<C[]>([]), [cid, setCid] = useState<string | undefined>();
  const [msgs, setMsgs] = useState<M[]>([]), [input, setInput] = useState(""), [busy, setBusy] = useState(false);
  const [tier, setTier] = useState("balanced"), [att, setAtt] = useState<{ name: string; text: string }[]>([]);
  const [open, setOpen] = useState(false), [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setS(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, x) => setS(x));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    setTier(localStorage.getItem("tier") || "balanced");
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  const loadConvs = async () => {
    const { data } = await supabase.from("conversations").select("id,title").order("updated_at", { ascending: false });
    setConvs(data || []);
  };
  useEffect(() => { if (s) loadConvs(); }, [s]);

  const pick = async (id?: string) => {
    setCid(id); setOpen(false); setMsgs([]);
    if (!id) return;
    const { data } = await supabase.from("messages").select("role,content").eq("conversation_id", id).order("created_at");
    setMsgs((data || []) as M[]);
  };
  const del = async (id: string) => {
    if (!confirm("Delete this conversation permanently?")) return;
    await supabase.from("conversations").delete().eq("id", id);
    if (cid === id) pick(); loadConvs();
  };
  const attach = async (files: FileList | null) => {
    if (!files) return; setErr("");
    for (const f of Array.from(files)) {
      if (!TEXT_EXT.test(f.name) || f.size > 200_000) { setErr(`${f.name}: only text files under 200 KB for now.`); continue; }
      setAtt((a) => [...a, { name: f.name, text: await f.text() }]);
    }
  };
  const send = async () => {
    const q = input.trim(); if (!q || busy || !s) return;
    const full = att.length ? q + "\n\n" + att.map((a) => `--- ${a.name} ---\n${a.text}`).join("\n\n") : q;
    const next: M[] = [...msgs, { role: "user", content: full }];
    setMsgs([...next, { role: "assistant", content: "" }]); setInput(""); setAtt([]); setBusy(true); setErr("");
    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ conversationId: cid, messages: next, tier, title: att.length ? q : undefined }),
      });
      if (!r.ok || !r.body) throw new Error(r.status === 429 ? "Slow down a little." : `Request failed (${r.status})`);
      const id = r.headers.get("x-conversation-id") || undefined;
      const rd = r.body.getReader(), dec = new TextDecoder(); let acc = "";
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: acc }]);
      }
      if (!cid && id) { setCid(id); loadConvs(); }
    } catch (e: any) { setErr(e.message); setMsgs(next); } finally { setBusy(false); }
  };

  if (!ready) return null;
  if (!s) return <Auth />;
  return (
    <div className="app">
      <aside className={"side" + (open ? " open" : "")}>
        <b>ZOBAER AI</b>
        <button onClick={() => pick()}>+ New chat</button>
        <div className="list">{convs.map((c) => (
          <div key={c.id} className={"item" + (c.id === cid ? " on" : "")} onClick={() => pick(c.id)}
            onDoubleClick={() => del(c.id)} title="Double-click to delete">{c.title}</div>))}</div>
        <button className="g" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </aside>
      <section className="main">
        <div className="top">
          <button className="g menu" onClick={() => setOpen(!open)}>☰</button>
          <span style={{ flex: 1, color: "var(--m)" }}>Your Personal AI Operating Assistant</span>
          <select style={{ width: "auto" }} value={tier} onChange={(e) => { setTier(e.target.value); localStorage.setItem("tier", e.target.value); }}>
            <option value="fast">Fast</option><option value="balanced">Balanced</option><option value="advanced">Advanced</option>
          </select>
        </div>
        <div className="msgs">
          {!msgs.length && <div className="hero"><h1>Good day, {s.user.email?.split("@")[0]}.</h1><p>How can I help you today?</p></div>}
          {msgs.map((m, i) => <div key={i} className={"m " + m.role}>{m.content || "…"}</div>)}
          <div ref={end} />
        </div>
        <div className="bar">
          {err && <div style={{ color: "#ff8a8a", maxWidth: 760, margin: "0 auto 8px" }}>{err}</div>}
          {att.length > 0 && <div style={{ maxWidth: 760, margin: "0 auto 8px", color: "var(--m)" }}>📎 {att.map((a) => a.name).join(", ")}</div>}
          <div className="row">
            <label className="g" style={{ border: "1px solid var(--b)", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}>
              📎<input type="file" multiple hidden onChange={(e) => attach(e.target.files)} /></label>
            <textarea rows={1} value={input} placeholder="Tell me what you want done…" onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button disabled={busy || !input.trim()} onClick={send}>Send</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Auth() {
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setMsg("");
    const { error, data } = mode === "in" ? await supabase.auth.signInWithPassword({ email, password: pw })
      : await supabase.auth.signUp({ email, password: pw });
    if (error) setMsg(error.message); else if (mode === "up" && !data.session) setMsg("Check your email to confirm your account.");
    setBusy(false);
  };
  return (
    <div className="auth">
      <h2 style={{ margin: 0 }}>ZOBAER AI</h2>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Password (min 6)" value={pw} onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()} />
      <button disabled={busy} onClick={go}>{mode === "in" ? "Sign in" : "Create account"}</button>
      <button className="g" onClick={() => setMode(mode === "in" ? "up" : "in")}>{mode === "in" ? "Need an account?" : "Have an account?"}</button>
      {msg && <div style={{ color: "var(--m)" }}>{msg}</div>}
    </div>
  );
}
