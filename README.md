# BankSim — Blue-Team AI Firewall

> Hackathon entry for **PromptWars x UVCE** (Marvel @ UVCE, powered by Hack2skill) — 8-hour build sprint, **AI Security & FinTech** category.

- **Live demo:** TBD (public deployment URL — must work on another device)
- **Problem statement:** [docs/problem-statement.md](docs/problem-statement.md)
- **Abstract:** [docs/abstract.md](docs/abstract.md)
- **Architecture deck:** [docs/architecture-deck.md](docs/architecture-deck.md)
- **Configuration prompts:** [prompts/](prompts/) — vibe-coding log + the product's own LLM prompts

## Build phases

| Phase | What | Status |
|---|---|---|
| **1. Banking simulator** | A fully working retail internet-banking app (Next.js + Supabase): accounts, atomic transfers, deposits/withdrawals, statements, cards, beneficiaries, notifications. **No AI features.** | **Built and verified end-to-end** (see "What's verified" below) |
| **2. Blue-team AI firewall** | Intercepts, analyzes and sanitizes untrusted input (free-text requests, memos) before any tool executes. Deterministic JSON verdict: `status` (APPROVED/BLOCKED), `risk_score`, `threat_category`, `explanation`. Product prompts live in `prompts/app/`. | Next — layered on the deployed Phase 1 |

The firewall needs something real to protect. Phase 1 is that something: a banking backend where tool calls genuinely move money in an atomic, auditable ledger — so a blocked injection means a transaction that provably never happened.

## What BankSim does today (Phase 1)

- **Email/password auth** with middleware-protected routes and an onboarding trigger that creates a profile, a CHECKING account with a unique 11-digit number, an ACTIVE VISA card and a welcome notification on signup.
- **Atomic money movement** through `SECURITY DEFINER` Postgres functions only — clients can never write a balance directly (`perform_transfer`, `cash_transaction`). A transfer writes two ledger rows sharing one reference, updates both balances, and notifies both users — or rolls back completely.
- **Statements** with filters (account, type, direction, date range, memo/reference search), pagination (10/page) and one-click CSV export.
- **Cards** with freeze/unfreeze, **beneficiaries** with add/remove, **notifications** with read tracking, **settings** with profile edit and password change.
- All money is `numeric(14,2)`; amounts validated client-side, server-side, and in the database. Timestamps render in Asia/Kolkata; account numbers are masked (`••••4291`) except behind an explicit reveal toggle.

### What's verified end-to-end (not just claimed)

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
- Deploy target: **Vercel**
- No other external services. No LLM calls in Phase 1 by design.

## Run locally

### 1. Create the Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor** and run, in order:
   - `supabase/migrations/20261011000001_schema.sql`
   - `supabase/migrations/20261011000002_rls.sql`
   - `supabase/migrations/20261011000003_functions.sql`
   - `supabase/seed.sql`
   
   (Or, with the Supabase CLI linked to the project: `supabase db push` runs the migrations; then paste `supabase/seed.sql` in the SQL Editor. The seed is idempotent — safe to re-run to reset the demo data.)
3. **Auth → Sign In / Providers → Email**: turn **off** "Confirm email" for the demo. The seed users are pre-confirmed; this switch is only so freshly registered demo accounts skip the inbox step.

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill both values from **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

The anon key is meant to be public — every table is protected by RLS and all money movement goes through database functions. Never put the `service_role` key here.

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
```

## Deploy to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com/new), **Import** the repo. Framework auto-detects as Next.js — no build settings to change.
3. Add the two environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for **Production, Preview and Development**.
4. **Deploy.** Then open the URL on another device: log in with a demo account, check the dashboard balance, and make a transfer — the live deployment is the demo.
5. In Supabase, add the Vercel URL under **Auth → URL Configuration → Site URL / Redirect URLs** (only needed if you later enable email confirmation or OAuth).

## SQL test suite (optional)

`supabase/tests/` contains a harness that lets the migrations + seed + verification suite run on any plain Postgres:

```bash
# with a local Postgres reachable as $PGHOST/..:
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/tests/local_harness.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000001_schema.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000002_rls.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000003_functions.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/seed.sql   # twice = idempotency check
psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/tests/verify.sql
```

`verify.sql` asserts: seed shape and ledger integrity (every `balance_after` consistent, target balances exact), onboarding trigger behaviour, RLS read isolation, column-level privilege enforcement, transfer atomicity (both sides + notifications), every rejection path, zero partial state, and reference uniqueness.

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
