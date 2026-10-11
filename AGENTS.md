# Memory

## Project

BankSim: a blue-team AI firewall for a mock banking assistant (PromptWars × UVCE hackathon). Request flow and output contract: `README.md`. Prompt deliverable rules: `prompts/README.md`.

## Prompt Files — Keep In Sync For The Submission

`prompts/` is a required, judge-scored submission deliverable ("Prompt & AI rigor", 20%). Every time you make a change for the submission, update the prompt files in the same pass. Never finish a submission-related task while `prompts/` is out of sync with what the app actually does.

- `prompts/system-prompt.md` — source of truth for model-facing behavior. Update the prompt file first, then wire the change into code. Never change prompt behavior only in code.
- `prompts/CHANGELOG.md` — add a row for every prompt version: version, time, change (before → after), reason, eval result. Get numbers from the eval route (`/api/eval`, strict mode) and record recall / false-block.
- `prompts/eval-set.json` — add or adjust cases for every new attack, benign, ambiguous, or invalid input the change affects.
- Keep at least one edge-case demo input that reliably demonstrates the guardrails working.
- Commit prompt file changes together with the code change they belong to.
