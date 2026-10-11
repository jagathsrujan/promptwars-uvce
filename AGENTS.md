# AGENTS.md — PromptWars x UVCE

Instructions for every AI coding agent (Command Code, Cursor, Copilot, etc.) working in this repository. Read this fully before making changes.

## What this repo is

Hackathon entry for **PromptWars x UVCE** (Marvel @ UVCE, powered by Hack2skill) — an 8-hour build sprint with a hard submission lock.

- **Entry: BankSim — Blue-Team AI Firewall** (category: AI Security & FinTech) — a defensive AI firewall that intercepts, analyzes, and sanitizes untrusted inputs before any mock financial tool executes. Requirements: `docs/problem-statement.md`.
- **Build order:** Phase 1 = realistic banking simulator (Next.js + Vercel + Supabase, **no AI features**) deployed first; Phase 2 = conversational banking assistant with real tool access (balances, history, payments — via Vercel AI SDK on the Command Code Provider API, model `deepseek/deepseek-v4.1-flash`); Phase 3 = blue-team AI firewall layered between user input and every tool — L0 deterministic signature pre-filter → L1 `typesafe/jev` decision-model classifier (`/provider/v1/systemone`) → L2 `deepseek/deepseek-v4.1-flash` deep analysis → L3 deterministic execution guardrails; fail-closed everywhere (product prompts in `prompts/app/`). Don't start a phase until the previous one is deployed and verified on the live URL.

- Problem statement released: 11 Oct 2026, 10:00 AM (see `docs/problem-statement.md`)
- **Submission deadline: 11 Oct 2026, 6:00 PM sharp. Platform locks automatically. No grace period.**
- Round 2 (top 10): live jury defence on 12 Oct — 5 min demo, 3 min architecture & prompt defence, 2 min jury Q&A / edge-case stress testing.

## Non-negotiable rules for every agent session

1. **Log every prompt.** Any prompt used to generate or modify code in this repo MUST be appended to `prompts/vibe-coding/prompt-log.md` — timestamp, verbatim prompt, what it produced, files touched. Configuration prompts are a mandatory scored deliverable; judges read them. If you (the agent) make a multi-step change driven by one prompt, log that one prompt.
2. **Keep the repo deployable.** Every change must leave `main` in a state that builds and runs. Judges open the live deployment link — a broken deployment on review is disqualification. Never push half-wired code over a working state.
3. **Optimize for the rubric** (50 marks):
   | Criterion | Marks | What it demands from you |
   |---|---|---|
   | Innovation & novelty | 12.5 | Original idea or implementation angle |
   | Problem-solving depth | 12.5 | Meaningful solution to the stated problem, not a superficial UI |
   | Prompt & AI rigor | 10.0 | Deliberate prompt design, structured + tested AI workflow |
   | Functionality & cloud deployment | 10.0 | Working deployed prototype on a public URL |
   | Pitch delivery & defence | 5.0 | Clear communication, direct answers under questioning |
4. **No phantom features.** Do not scaffold, stub, or imply features that don't work end-to-end. `docs/abstract.md` and `docs/architecture-deck.md` must describe only what is actually implemented — the jury explicitly checks claims against the demo.
5. **Defensive implementation is scored.** The deck must cover "how the solution handles misuse or edge cases." Validate inputs at boundaries, handle ambiguous/invalid/empty/adversarial inputs explicitly, and record edge cases in `docs/architecture-deck.md` as you fix them.
6. **One end-to-end core path beats many half features.** Prefer completing the single user journey over breadth. Say no to scope creep; the sprint clock wins every argument.
7. **Test before declaring done.** Run the build, exercise the core path, try a normal input, an ambiguous input, an invalid input, and at least one adversarial input. Fix what breaks the main task first.

## Repository layout

```
AGENTS.md            <- this file: agent contract
README.md            <- public front page judges see first
docs/
  hackathon-brief.md <- timeline, deliverables, rubric, defence format (from the official guidebook)
  problem-statement.md   <- pasted official statement (source of truth for requirements)
  abstract.md        <- deliverable 4: written abstract
  architecture-deck.md   <- deliverable 3: outline + speaker notes for the deck
prompts/
  README.md          <- prompt deliverable policy: what goes where
  vibe-coding/prompt-log.md  <- chronological log of ALL build prompts (required)
  app/               <- the product's own LLM configuration prompts (system prompt, examples) — versioned here
src/                 <- application code (stack-agnostic until chosen)
```

## Stack & run commands

> Fill this in the moment the stack is chosen, and keep it current. Agents rely on this to build/test.

- Stack: Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS 4; Supabase (Postgres + Auth + RLS) as the only backend; Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`) calling the Command Code Provider API (`deepseek/deepseek-v4.1-flash`, server-side only in `/api/chat`, env `COMMANDCODE_API_KEY`)
- Install: `npm install`
- Run locally: `npm run dev` (needs `.env.local` — copy `.env.example`; see README)
- Build: `npm run build` · Typecheck: `npm run typecheck`
- SQL test suite: apply `supabase/tests/local_harness.sql` → `supabase/migrations/*` → `supabase/seed.sql` (twice) → `supabase/tests/verify.sql` → `supabase/tests/verify_chat.sql` on any plain Postgres (see README)
- Deploy target: Vercel (+ Supabase project; run `supabase/migrations/*` then `supabase/seed.sql` in the SQL Editor; set `COMMANDCODE_API_KEY` in Vercel env for Production/Preview/Development; optional `DECISIONS_API_KEY` as the L1 backup)
- Live URL: **https://banksim-uvce.vercel.app** (Vercel project `banksim-uvce`, Supabase project `banksim-uvce`, region Mumbai)

## Prompt conventions

- **Vibe-coding prompts** (prompts given to coding agents to build this repo) → append to `prompts/vibe-coding/prompt-log.md`.
- **Product prompts** (LLM system/user prompts that ship inside the solution) → keep in `prompts/app/`, versioned. When a product prompt changes, add a one-line entry to the same log referencing the change.
- Keep prompts copy-pasteable: verbatim, fenced code blocks, no paraphrasing. Judges grade prompt rigor from these artifacts.

## Deliverable checklist (all four must be verifiable before 6:00 PM)

- [ ] Public GitHub repo — source + structured docs + configuration prompts visible in a logged-out browser
- [ ] Live functional deployment — public URL loads, core flow works on another device
- [ ] Architecture deck — system design, prompt flow, defensive implementation
- [ ] Written abstract — problem, strategy, novelty, what the prototype demonstrates

## When you (the agent) are unsure

- Requirements come from `docs/problem-statement.md` first, `docs/hackathon-brief.md` second, this file third.
- Don't ask the team to choose between options during the sprint unless it's irreversible or affects scoring; pick the option that keeps the core path working and note the decision.
- If a change risks the deployment, do it on a branch and merge only after the live URL still works.
