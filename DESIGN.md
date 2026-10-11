# BankSim v2 — Design

SBI-style demo banking portal with a dual-mode AI assistant. **Guarded mode** runs every
input through a 4-stage firewall before any bank tool can execute. **Raw mode** is the
unprotected A/B baseline. `/dev` streams the full decision trace of every request.

## The spine

```
input: user message + untrusted memo + requested action
  │
L0  Normalize + tripwires      [code — deterministic]
      decode base64/URL · strip invisible chars · wrap memo as UNTRUSTED DATA
      tag tripwires: authority claims · canary · phishing asks · injections
  │
L1  Parallel checkers          [3 prompts · same model · run concurrently]
      threat checker  (injection / jailbreak / roleplay)
      intent checker  (real banking ask vs scam / social engineering)
      memo checker    (is the memo trying to instruct?)
      each returns strict JSON: {risk 0-100, category, evidence, confidence}
  │
L2  Aggregator + policy        [code — deterministic]
      weighted score = checkers + tripwires → final risk 0-100
      ≤35 allow · 35–74 verify (confirm + OTP) · ≥75 block
      any timeout, parse error, or ambiguity → BLOCK (fail-closed)
  │
L3  Tool gate                  [code]
      APPROVED → tool runs (transfers always quote + confirm first)
      BLOCKED  → executed_tool: null + structured reasons
  │
  └─ every stage streams to /dev → prompts sent, raw checker JSON, votes,
     the math, and timings in real time
```

Design rules: **models judge, code decides** (the LLM never has the final word);
fail-closed everywhere; each prompt is a file in `prompts/` (judges read them).

## Modes

- **guarded** — full L0→L3; verdict + reasons on every reply; tools gated
- **raw** — same model, same tools, no firewall (the "before" side of the A/B)

## The bank

- Portal screens: login → dashboard (balances, transactions) → transfer (quote + confirm
  + OTP when flagged) → history. Chat dock overlays every screen.
- Tools: `get_balance`, `get_history`, `start_transfer` (quote only), `navigate`.
- Transfers carry an untrusted **memo** (the PS's memo-smuggling surface). Tool output
  and memos are wrapped as data, never instructions.

## Dev panel (/dev)

Per request, live: L0 signals → checker prompts + raw JSON + votes → aggregator math →
verdict → gating + tool result, with timings. Plus a prompt-library viewer.

Every guarded response carries its full trace; the panel reads them from the browser
(localStorage) — so it works on any host, including serverless deploys.

All stateful bank ops live in one route function (`/api/bank`) because serverless
functions don't share memory — separate routes would each hold their own ledger.

## Layout

```
prompts/                ← deliverable: agent + checker prompts, eval corpus, CHANGELOG
web/
  scripts/sync-prompts.mjs   ← compiles prompts/*.md → lib/firewall/prompts.generated.ts
  lib/firewall/              ← L0 normalize · checkers · aggregator · gate · llm + stub
  lib/bank/                  ← mock ledger (globalThis-backed) + tool implementations
  app/api/bank/              ← ONE function: state · chat · quote · confirm · reset
  app/api/                   ← …plus dev/prompts · eval · health (stateless)
  app/page.tsx               ← portal (client state machine)
  app/dev/page.tsx           ← dev panel
```

## Phases

1. **v1 first cut (done)** — thin end-to-end; runs with zero keys via a deterministic
   offline stub, real model the moment `LLM_API_KEY` lands in `web/.env.local`
2. **Breakage pass** — red-team it: run `/api/eval`, hunt holes (indirect injection via
   tool output, encoding tricks, false-block traps)
3. **Optimize** — prompt tuning, latency, UI polish
4. **Submit** — deploy, docs, demo rehearsal

## Env (all optional — stub without keys)

```
LLM_API_KEY=…         # any OpenAI-compatible provider
LLM_BASE_URL=…        # e.g. https://api.openai.com/v1
LLM_MODEL=…           # e.g. gpt-4o-mini
```
