# Configuration Prompts (REQUIRED deliverable — version every change)

All prompts the app uses must live here and be committed. Judges score "Prompt & AI rigor" (20%).

## Files
- `system-prompt.md` — the system prompt sent to the model
- `eval-set.json` — test inputs incl. normal / ambiguous / invalid / adversarial
- `CHANGELOG.md` — every prompt edit with reason + result

## Rules during sprint
1. Never edit prompts only in code — update `system-prompt.md` first, then wire in.
2. Log each version in CHANGELOG with before → after + eval delta.
3. Keep 1 edge-case demo input that reliably shows guardrails working.
