# Contract Scanner — Project Bible

## Product

A SaaS portal where users upload a PDF contract. The app highlights dangerous clauses, explains them in plain English, and suggests safer rewrites.

- **Free tier**: 1 scan (enforced server-side)
- **Pro tier**: Unlimited scans ($29/mo via Stripe)

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router (no Pages Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Database / Auth / Storage | Supabase |
| Package manager | **pnpm only** — never npm or yarn |
| AI | Google Gemini 2.5 Flash via `@google/genai` SDK only |
| Payments | Stripe |
| Deployment | Vercel |

---

## Database Schema

```sql
-- Users
id              uuid  PK
email           text  UNIQUE
stripe_customer_id  text
tier            text  DEFAULT 'free'   -- 'free' | 'pro'
scans_used      int   DEFAULT 0
created_at      timestamptz

-- Contracts
id              uuid  PK
user_id         uuid  FK → users.id
file_url        text
title           text
status          text   -- 'pending' | 'complete' | 'error'
created_at      timestamptz

-- Scans
id              uuid  PK
contract_id     uuid  FK → contracts.id
risk_json       jsonb
model_used      text
tokens_used     int
scanned_at      timestamptz
```

---

## Absolute Rules (never break these)

1. **pnpm only.** Never use `npm install` or `yarn` for anything project-related.
2. **shadcn/ui first.** Always use the shadcn CLI to add components. Never write custom Tailwind HTML for standard UI primitives.
3. **No hardcoded secrets.** All API keys live in `process.env` sourced from `.env.local`. Never commit `.env.local`.
4. **Single Gemini call per scan.** No vector databases, no chunking, no embeddings. One `generateContent` call with the full PDF text.
5. **Stop-on-repeat-error.** If you hit the same error twice in a row, stop, explain, and wait for the Engineering Manager's instruction. Do not attempt a third automatic fix.
6. **Dependency approval required.** Ask for explicit approval before installing any heavy new dependency (anything beyond the core stack).
7. **Validate Gemini JSON.** Always validate the Gemini response against the expected schema before writing to the DB. If malformed, return HTTP 422 with the raw output.
8. **Highlight fallback.** If PDF bounding-box highlight mapping fails after 2 attempts, switch to a sidebar risk panel. Do not block sprint progress on highlights.
9. **Server-side free-tier gate.** `users.scans_used` must be checked server-side in `/api/scan`. Never gate only on the client.
10. **Commit after every working feature.**

---

## Roles

- **Engineering Manager (human)**: Visual QA, design decisions, writing the Gemini system prompt, providing API keys, approving new dependencies, making GO / SWITCH / STOP calls on blockers.
- **Full-stack developer (Claude)**: Scaffold, implement, debug, refactor, deploy.

---

## Sprint Plan (1 week)

| Day | Goal |
|---|---|
| 0 | Mac prerequisites, repo init, CLAUDE.md |
| 1 | Next.js scaffold, Supabase project, auth (magic link), DB migrations |
| 2 | PDF upload UI + Supabase Storage, contracts table write |
| 3 | Gemini scan API route, risk JSON schema, scans table write |
| 4 | Risk display UI — sidebar panel (highlight stretch goal) |
| 5 | Dashboard (scan history), free-tier gate, polish |
| 6 | Stripe integration (checkout + webhook), Pro gate |
| 7 | Vercel deploy, env vars, smoke test, launch checklist |

---

## Environment Variables (never commit values)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Gemini
GEMINI_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

---

## Key File Conventions

- API routes live in `app/api/`
- Supabase client helpers: `lib/supabase/client.ts` (browser) and `lib/supabase/server.ts` (server)
- Types generated from Supabase: `types/supabase.ts`
- All shadcn components in `components/ui/` (managed by CLI, do not hand-edit)
- Custom components in `components/`
