# BankSim — Blue-Team AI Firewall

> Hackathon entry for **PromptWars x UVCE** (Marvel @ UVCE, powered by Hack2skill) — 8-hour build sprint, **AI Security & FinTech** category.

- **Live demo:** **https://banksim-uvce.vercel.app** — sign in with a demo account below (password `BankSim@123`)
- **Problem statement:** [docs/problem-statement.md](docs/problem-statement.md)
- **Abstract:** [docs/abstract.md](docs/abstract.md)
- **Architecture deck:** [docs/architecture-deck.md](docs/architecture-deck.md)
- **Configuration prompts:** [prompts/](prompts/) — vibe-coding log + the product's own LLM prompts

## Build phases

| Phase | What | Status |
|---|---|---|
| **1. Banking simulator** | A fully working retail internet-banking app (Next.js + Supabase): accounts, atomic transfers, deposits/withdrawals, statements, cards, beneficiaries, notifications. **No AI features.** | **Built and verified end-to-end** (see "What's verified" below) |
| **2. Conversational assistant with real tool access** | An in-app banking assistant (deepseek/deepseek-v4.1-flash via the Command Code Provider API + Vercel AI SDK) that reads real data (balances, statements, beneficiaries, cards) and can move real money through Phase 1's RPCs — with a human confirmation tap required for every money/account action. | **Built and verified end-to-end** (transfer executed via chat = identical ledger + notifications to the Phase 1 form) |
| **3. Blue-team AI firewall** | Intercepts, analyzes and sanitizes untrusted input (free-text requests, memos) before any tool executes. Deterministic JSON verdict: `status` (APPROVED/BLOCKED), `risk_score`, `threat_category`, `explanation`. Four layers: L0 signatures → L1 `typesafe/jev` probabilities → L2 deepseek deep analysis on escalations → L3 execution guardrails. Fail closed everywhere. | **Built and verified** — 25/25 live attack-matrix cases correct; console at `/firewall` |

The firewall needs something real to protect. Phase 1 is that something: a banking backend where tool calls genuinely move money in an atomic, auditable ledger — so a blocked injection means a transaction that provably never happened.

## What BankSim does today (Phase 1)

- **Email/password auth** with middleware-protected routes and an onboarding trigger that creates a profile, a CHECKING account with a unique 11-digit number, an ACTIVE VISA card and a welcome notification on signup.
- **Atomic money movement** through `SECURITY DEFINER` Postgres functions only — clients can never write a balance directly (`perform_transfer`, `cash_transaction`). A transfer writes two ledger rows sharing one reference, updates both balances, and notifies both users — or rolls back completely.
- **Statements** with filters (account, type, direction, date range, memo/reference search), pagination (10/page) and one-click CSV export.
- **Cards** with freeze/unfreeze, **beneficiaries** with add/remove, **notifications** with read tracking, **settings** with profile edit and password change.
- All money is `numeric(14,2)`; amounts validated client-side, server-side, and in the database. Timestamps render in Asia/Kolkata; account numbers are masked (`••••4291`) except behind an explicit reveal toggle.

## What BankSim does today (Phase 2 assistant)

- **Assistant at `/assistant` and in a slide-in panel** (floating button, available on every app page — same route handler, same components). Streams responses; tool results render as rich cards (balance cards, transaction tables, confirmation cards, receipts with reference numbers).
- **Real tool access through one chokepoint.** Every tool invocation goes through a single server-side `executeTool(name, params, ctx)` (`src/lib/assistant/execute-tool.ts`): strict Zod validation, the caller's own session (RLS + `auth.uid()`), and Phase 1's `SECURITY DEFINER` RPCs for all money movement. Phase 3's firewall will wrap this one function.
- **Nine working tools:** `list_accounts`, `get_transactions`, `list_beneficiaries`, `list_cards` (read) and `transfer_money`, `deposit_cash`, `withdraw_cash`, `add_beneficiary`, `set_card_status` (each requires an explicit confirmation).
- **Human-in-the-loop confirmations.** Money/account actions are *proposed* — the server stores a single-use, 5-minute, user-bound token (`confirmation_tokens`, no client grants; issued/redeemed only via `SECURITY DEFINER` RPCs). The action executes only when the user taps **Confirm** on the card; "yes" typed in chat can never execute anything, and expired/reused tokens are rejected by the database.
- **Persistent conversations** (`conversations` + `chat_messages`, RLS) — the most recent thread resumes on load, with a new-conversation button. Model calls and the `COMMANDCODE_API_KEY` happen exclusively server-side in `/api/chat`.
- **Product prompt** lives verbatim in [`prompts/app/assistant-system-prompt.md`](prompts/app/assistant-system-prompt.md) (mirrored in `src/lib/assistant/prompt.ts`): clarify ambiguous requests instead of guessing, report tool failures plainly, refuse cross-user data and prompt-injection attempts, never reveal internals.

### Phase 2 verified end-to-end

Against the live Supabase-backed app with a real model (Command Code Provider API):

- "what's my balance?" → correct accounts card + total from the real ledger; "show last 10 transactions for checking" → real 10-row statement card.
- "pay Rahul 500 from savings with memo dinner" → assistant resolved *savings* to the right account, *Rahul* to his saved beneficiary, and proposed a confirmation card; **"yes go ahead" in chat did not execute** (assistant: "I can't execute it from chat — tap Confirm"); tapping Confirm produced `TXN-20261011-1FA241` with the receipt card, and Rahul's side showed the mirrored `TRANSFER_IN` row plus the "Money received" notification — byte-identical in shape to the Phase 1 transfer form.
- SQL suite (`supabase/tests/verify_chat.sql`) proves: conversations/chat messages RLS isolation, `confirmation_tokens` has **no direct client access**, single-use + 5-minute TTL + user binding enforced by the token RPCs, cross-user redemption rejected without consuming the token, and cascade integrity.
- `COMMANDCODE_API_KEY` verified absent from the client bundles (`grep` over `.next/static`).

### Phase 3 verified end-to-end (the firewall)

- **Live attack matrix — 25/25 cases behaved exactly as expected** (`npm run test:live` runs the real pipeline: L0 → jev → deepseek). Every attack preset is BLOCKED with the correct category (injection, jailbreak, roleplay, zero-width, base64, homoglyph, exfiltration, social engineering, mixed, memo attacks ×3 → `PROMPT_INJECTION`/`JAILBREAK`/`ROLEPLAY_ATTACK`/`HIDDEN_INSTRUCTION`/`DATA_EXFILTRATION`/`SOCIAL_ENGINEERING`); legit requests approve and route; the ambiguous preset blocks as `AMBIGUOUS_INPUT`; `show me Priya's balance` is blocked as `DATA_EXFILTRATION`. L0 blocks cost ~0–10 ms with zero LLM calls; the clean path adds ~0.6 s (one jev call); the full table lives in [`docs/architecture-deck.md`](docs/architecture-deck.md).
- **Fail-closed is verified, not asserted**: with the “jeV classifier down” / “Deep analysis (L2) down” simulation switches in the console, verdicts come back BLOCKED with `deciding_layer: FAIL_CLOSED` — a classifier outage can never become an approval.
- **Form memos are scanned** (L0 + L1) before `perform_transfer`; an attack memo refuses the transfer and renders the verdict JSON in the form. Chat tool-call memos are re-scanned at proposal *and* execution.
- **Guardrails are live**: 30 chat messages / 5 min, 10 executed money ops / hour, and 5 hostile blocks in 10 min → 15-minute money-tool lockout (read-only chat keeps working). Every decision — input, verdict JSON, per-layer signals, raw jev probabilities, L2 reasoning, latency — lands in `firewall_logs` and the console feed at `/firewall`.
- **RLS verified on the hosted database** with two real users: cross-user read returns empty, a forged insert is rejected (403), delete is rejected (403).
- 72 unit tests cover the pure layers (normalizer, signatures, weights, decision table, lockout math): `npm test`.

### Phase 1 verified end-to-end (not just claimed)

Verified against a local Postgres + GoTrue + PostgREST stack (a hosted Supabase equivalent) with real HTTP + browser flows:

- Login with seeded demo users; register → auto-onboarding (profile, 11-digit account, VISA card, welcome notification) → dashboard shows the real ₹0.00 balance.
- Transfer between two demo users: both balances move, both ledger rows share one reference, both users get notifications (checked row-by-row in the database).
- Insufficient funds / frozen account / closed account / self-transfer / over-limit / malformed account number → clean human error messages, **zero partial state** (no ledger rows, no balance drift).
- Statement filters, pagination and CSV export (quoted fields, UTF-8 BOM, exact amounts).
- Card freeze/unfreeze, beneficiary add/remove with confirm, notification read toggles, profile update, password change (verified by a fresh login), sign out.
- A SQL test suite (see below) covering RLS isolation, column-level privilege enforcement, ledger integrity and seed idempotency.

## Stack

- **Next.js 15** (App Router) + **TypeScript** (strict) + **Tailwind CSS 4**
- **Supabase** — Postgres, Auth (email/password), Row Level Security. The only backend.
- **Vercel AI SDK** (`ai` + `@ai-sdk/openai-compatible` + `@ai-sdk/react`) talking to the **Command Code Provider API** (`https://api.commandcode.ai/provider/v1`, OpenAI Chat Completions wire) — model `deepseek/deepseek-v4.1-flash`, temperature 0.2. Server-side only, behind `/api/chat`.
- Deploy target: **Vercel**. No other external services.

## Run locally

### 1. Create the Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor** and run, in order:
   - `supabase/migrations/20261011000001_schema.sql`
   - `supabase/migrations/20261011000002_rls.sql`
   - `supabase/migrations/20261011000003_functions.sql`
   - `supabase/migrations/20261011000004_chat.sql` (Phase 2 assistant: conversations, chat messages, confirmation tokens)
   - `supabase/migrations/20261011000005_chat_client_id.sql`
   - `supabase/migrations/20261011000006_firewall.sql` (Phase 3 firewall audit log + RLS)
   - `supabase/seed.sql`
   
   (Or, with the Supabase CLI linked to the project: `supabase db push` runs the migrations; then paste `supabase/seed.sql` in the SQL Editor. The seed is idempotent — safe to re-run to reset the demo data.)
3. **Auth → Sign In / Providers → Email**: turn **off** "Confirm email" for the demo. The seed users are pre-confirmed; this switch is only so freshly registered demo accounts skip the inbox step.

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill the values from **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
COMMANDCODE_API_KEY=cc-your-key-from-command-code-studio
```

The anon key is meant to be public — every table is protected by RLS and all money movement goes through database functions. Never put the `service_role` key here.

`COMMANDCODE_API_KEY` (Command Code Studio → **Settings → API keys**) powers the Phase 2 assistant. It is **server-side only** — used exclusively by `/api/chat` and never sent to the browser or committed to the repo. The assistant shows a friendly "not configured" state if it's missing; the rest of the app works without it.

### 3. Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Demo data: three customers — `aarav@banksim.demo`, `priya@banksim.demo`, `rahul@banksim.demo` — password `BankSim@123` (also shown on the login page with one-tap fill). Each has a CHECKING + SAVINGS account with ~30 days of realistic ledger history, cards, beneficiaries across each other (so the transfer demo works instantly), and unread notifications.

Other commands:

```bash
npm run build      # production build (passes with no env vars set)
npm run typecheck  # tsc --noEmit
npm test           # 72 unit tests: L0 normalizer, signatures, weights, decision table, lockout
npm run test:live  # live attack matrix (needs COMMANDCODE_API_KEY): real jev + deepseek calls
```

## Deploy to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com/new), **Import** the repo. Framework auto-detects as Next.js — no build settings to change.
3. Add the environment variables for **Production, Preview and Development**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `COMMANDCODE_API_KEY` (or copy them: `vercel env pull` / `vercel env add`).
4. **Deploy.** Then open the URL on another device: log in with a demo account, check the dashboard balance, ask the assistant for your balance, and make a transfer — the live deployment is the demo.
5. In Supabase, add the Vercel URL under **Auth → URL Configuration → Site URL / Redirect URLs** (only needed if you later enable email confirmation or OAuth).

## SQL test suite (optional)

`supabase/tests/` contains a harness that lets the migrations + seed + verification suite run on any plain Postgres:

```bash
# with a local Postgres reachable as $PGHOST/..:
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/tests/local_harness.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000001_schema.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000002_rls.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000003_functions.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000004_chat.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000005_chat_client_id.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000006_firewall.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/seed.sql   # twice = idempotency check
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/tests/verify.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/tests/verify_chat.sql
```

`verify.sql` asserts: seed shape and ledger integrity (every `balance_after` consistent, target balances exact), onboarding trigger behaviour, RLS read isolation, column-level privilege enforcement, transfer atomicity (both sides + notifications), every rejection path, zero partial state, and reference uniqueness. `verify_chat.sql` asserts: RLS isolation for conversations/chat messages, `confirmation_tokens` having no direct client access, and the confirmation-token RPCs' single-use + TTL + user-binding semantics.

## Repository structure

```
src/                 Next.js app (app router pages, components, lib)
supabase/
  migrations/        schema, RLS + grants, RPCs + onboarding trigger
  seed.sql           idempotent demo dataset (3 users, 30 days of history)
  tests/             local Postgres harness + verification suite
docs/                problem statement, abstract, architecture deck, hackathon brief
prompts/             configuration prompts deliverable (vibe-coding log + product LLM prompts)
```

## Design decisions worth knowing

- **Ledger references are unique per account, not globally.** A transfer must produce two rows with one shared reference (sender + receiver), so the constraint is `unique (reference, account_id)`. Every other write (deposit/withdrawal) uses its own reference.
- **Deadlock-free transfers.** Both accounts are locked in ascending id order before balances change, so concurrent opposite transfers can't deadlock.
- **Column-level grants on top of RLS.** `authenticated` may update exactly `cards.status`, `notifications.is_read`, and `profiles.full_name/phone` — nothing else, on top of row-level policies.
- **Client-side filters with server-side authority.** The statement filters/paginates in the browser for instant UX (and clean CSV export); all money movement is validated and executed by Postgres functions regardless of what the client sends.

## Team

- *(names)*
