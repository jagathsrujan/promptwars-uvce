# Security Policy

## Reporting a vulnerability

BankSim is a hackathon prototype that handles mock banking data. If you find a
security issue, **do not open a public issue**. Report it privately via the
repository's GitHub Security Advisories (Security tab → Report a vulnerability)
or through the Hack2skill event channel, including:

- a description of the issue and the affected file/route,
- steps to reproduce,
- any relevant logs or screenshots (redact personal data).

Reports are acknowledged as soon as possible. Do not use this prototype with
real banking data.

## Security controls implemented

Every claim below maps to code in this repo — no phantom features:

- **Fail-closed firewall.** Any classifier failure, timeout, or unparseable
  response ends in `BLOCKED` with `deciding_layer: FAIL_CLOSED`, never an
  approval (`src/lib/firewall/pipeline.ts`, `src/lib/firewall/verdict.ts`).
- **Deterministic rules are final.** Hard L0 signature hits block instantly;
  models contribute evidence but can never override a rule
  (`src/lib/firewall/l0.ts`, `src/lib/firewall/signatures.ts`,
  `src/lib/firewall/verdict.ts`).
- **Input normalization against obfuscation.** NFKC folding, invisible-character
  stripping with per-character counting, homoglyph folding, casefolding, and
  base64/hex decoding run before any classification
  (`src/lib/firewall/normalize.ts`).
- **Execution guardrails (L3).** No `APPROVED` verdict, no tool; sanitized-intent
  pins must match the tool family; tool-parameter memos are re-scanned at
  proposal and execution; money tools respect per-user budgets and a hostile-block
  lockout (`src/lib/firewall/l3.ts`, `src/lib/assistant/execute-tool.ts`).
- **Human confirmation for money.** Chat text can never execute a money or
  account action — only a single-use, 5-minute, user-bound confirmation token
  redeemed via `SECURITY DEFINER` RPCs (`supabase/migrations/20261011000004_chat.sql`).
- **Database authority.** Clients never write balances; money moves exclusively
  through `SECURITY DEFINER` Postgres functions with row-level security and
  column-level grants on top (`supabase/migrations/2026101100000*.sql`).
- **Server-side secrets.** `COMMANDCODE_API_KEY` is used only in server routes
  (`/api/chat`) and never shipped to the browser (verified absent from client
  bundles); all deepseek calls carry `x-cmd-zdr: 1` (zero data retention).
- **Rate limiting + lockout.** 30 chat messages / 5 min, 10 executed money ops /
  hour, and 5 hostile blocks in 10 min → 15-minute money-tool lockout, all
  computed from the RLS-scoped audit log (`src/lib/firewall/rate-limit.ts`).
- **Security headers.** `X-Content-Type-Options: nosniff`, `X-Frame-Options:
  DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive
  `Permissions-Policy` on every response (`next.config.ts`).
- **No secret or stack-trace leakage.** Unexpected failures return generic
  user-facing messages; audit-write failures are logged server-side and never
  turn into approvals (`src/lib/firewall/logs.ts`).
- **Audit trail.** Every firewall decision — input, verdict JSON, per-layer
  signals, latency — is persisted to RLS-scoped `firewall_logs` and rendered in
  the console at `/firewall` (`supabase/migrations/20261011000006_firewall.sql`).

## Not implemented

This prototype does **not** include encryption at rest beyond what Supabase /
Vercel provide, a distributed rate limiter (counts are per-project database
queries — correct at demo scale), or a real core-banking integration. The
classifier depends on an external provider API, so its availability and latency
are outside this project's control — by design, any outage fails closed.
