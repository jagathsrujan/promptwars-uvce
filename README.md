# BankSim v2 — SBI-style Demo Bank with a Blue-Team AI Firewall

**PromptWars × UVCE · AI Security & FinTech** — rebuilt from scratch, v2 first cut.

A demo banking portal where an AI assistant can move (mock) money. In **guarded mode**
every input — including untrusted transaction memos — passes a 4-stage firewall before any
bank tool executes. **Unprotected mode** runs the same model with no guardrails (the A/B
baseline). **/dev** shows every decision: the prompts sent, the checker votes, the math.

## Live map — what exists right now

- [x] Design spine → `DESIGN.md` · official problem statement → `PROBLEM_STATEMENT.md`
- [x] Prompt set v2.0 in `prompts/` (guarded agent, raw baseline, 3 parallel checkers,
      30-case red-team corpus, CHANGELOG) — compiled into the app by `web/scripts/sync-prompts.mjs`
- [x] Firewall core: L0 normalize + tripwires · L1 parallel checkers · L2 deterministic
      aggregator (fail-closed) · L3 tool gate
- [x] Mock bank + tools: balance, history, transfer quote → confirm → OTP
- [x] Demo auth backend: server-side session (httpOnly cookie, 30-min TTL) created at login —
      every financial op is bound to it, and the tool layer enforces account ownership
      (cross-account reads are denied even in Unprotected mode — authorization lives behind
      the tool gate, not in the prompt)
- [x] Portal UI: login, dashboard, transfer, history + chat dock + guarded/unprotected
      toggle + demo reset
- [x] Dev panel `/dev`: live per-request traces + prompt library viewer
- [x] Eval runner `POST /api/eval` — **stub engine: recall 18/18 attacks · false-block 0/9
      benign · edge 2/2 fail-closed**
- [ ] Real-model eval numbers (paste a key, re-run eval)
- [ ] Breakage pass (adversarial hunt) → Optimize → Deploy + submit

## Run it

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:3001** (port 3000 on this machine is used by the Excalidraw MCP server).

No keys needed: without `LLM_API_KEY` everything runs on a deterministic offline stub.
For a real model, copy `web/.env.example` → `web/.env.local` and set any OpenAI-compatible
provider (OpenAI, Gemini compat, Groq, OpenRouter, …):

```
LLM_API_KEY=…
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

## Three demo beats

1. **Unprotected mode** → run the “Poisoned memo” chip → the assistant follows the injected memo
2. **Guarded mode** → same attack → **BLOCKED** with risk score, category, and reasons
3. **/dev** → watch the three checker prompts vote, the aggregator math, and the tool gate

## Structure

```
prompts/                     ← the deliverable: every prompt, the corpus, the changelog
web/scripts/sync-prompts.mjs ← prompts/*.md → lib/firewall/prompts.generated.ts
web/lib/firewall/            ← L0 normalize · checkers · aggregator · gate · llm + stub
web/lib/bank/                ← mock ledger (per-customer) + demo sessions + tool implementations
web/app/api/bank/            ← ONE function: login · logout · state · chat · quote · confirm · reset
web/app/api/                 ← …plus dev/prompts · eval · health
web/app/page.tsx             ← portal · web/app/dev/page.tsx ← dev panel
```

## Notes

- All stateful ops live in one route (`/api/bank`) because serverless functions don't
  share memory — separate routes would each hold their own ledger copy.
- Demo auth: `demo` / `demo` logs in as customer CUS-1001 (Aarav Sharma); the session is an
  httpOnly cookie backed by an in-memory store. A second customer (CUS-2002, Priya Nair,
  account ACC-2002-7734) exists in the ledger but has no login — the "Cross-account probe"
  chip shows the tool layer denying reads on her account in both modes. This is deliberate
  fake-session realism, not real auth.
- `/dev` traces are stored in your browser (localStorage); every guarded response carries
  its full trace, so the panel works on any host.
- The previous sprint build is preserved at git branch `archive/banksim-v1`.
