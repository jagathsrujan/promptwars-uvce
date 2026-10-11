# Product LLM Prompts — PromptWars x UVCE

This directory holds the LLM configuration prompts that **ship inside the deployed solution**: the system prompt, few-shot examples, guardrails, and any structured output schemas.

## Conventions

- One file per prompt role, e.g. `system-prompt.md`. Add `v2` suffixes rather than overwriting history (`system-prompt-v2.md`) so prompt iteration is visible to judges.
- Each file states: when it's used, the verbatim prompt text in a fenced block, and the model/parameters it targets.
- Every change to a file here gets a one-line entry in `../vibe-coding/prompt-log.md`.
- Defensive instructions belong **inside these prompts** (refusal rules, handling empty/adversarial input, output format enforcement) — the deck's "defensive implementation" section cites them.

## Files

| File | Role | Status |
|---|---|---|
| `system-prompt.md` | Main system prompt of the product | TBD — fill once the stack/problem approach is set |
