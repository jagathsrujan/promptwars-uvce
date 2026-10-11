# Prompt Library — REQUIRED deliverable (judges score "Prompt & AI rigor")

Every prompt the app uses lives here as plain markdown. The app compiles these files
into TypeScript at dev/build time (`web/scripts/sync-prompts.mjs`), so what you read
here is exactly what the model receives — no drift between docs and runtime.

## Files
- `agent-guarded.md` — system prompt for guarded mode (behind the firewall)
- `agent-raw.md` — system prompt for unprotected mode (A/B baseline)
- `checker-threat.md` — L1 checker: injection / jailbreak / roleplay
- `checker-intent.md` — L1 checker: genuine banking intent vs scam / social engineering
- `checker-memo.md` — L1 checker: memo-as-instruction smuggling
- `eval-set.json` — red-team corpus run by `/api/eval` (benign / attacks / ambiguous / edge)
- `CHANGELOG.md` — every prompt change: before → after, reason, eval numbers

## Placeholders
The runner substitutes slots before each call:
- `<<<INPUT>>>` — normalized user message (with memo block appended when present)
- `<<<MEMO>>>` — the untrusted memo text alone

## Rules
1. Edit the prompt here first, then any code that consumes it — never the other way around.
2. Every edit gets a CHANGELOG row with eval numbers (recall / false-block) from `/api/eval`.
3. Keep one edge-case demo input in the corpus that reliably shows the guardrails working.
