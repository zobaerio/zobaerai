# ZOBAER AI — Phase 1
1. `cp .env.example .env.local` and fill in Supabase + at least one AI key.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. `npm install && npm run dev` (deploy: push to GitHub → Vercel, add the same env vars).

Phase 1: auth, streaming chat, history, provider abstraction + fallback, model tiers, text-file attach, PWA, RLS.
Not built yet (and not shown in the UI): tools, integrations, permission UI, tasks, memory, RAG, automations.
