# Taste

## Workflow

- Wants prompt/instruction files (e.g. `prompts/`) updated in the same pass as any related code change, rather than left to drift out of sync. Confidence: 0.7
- Prefers recurring, standing instructions be encoded persistently (e.g. project memory / system prompt such as `AGENTS.md`) so they apply automatically across future sessions instead of relying on being re-stated each time. Confidence: 0.7
- Likes to ideate/brainstorm collaboratively with the agent before jumping into implementation, rather than having the agent build immediately. Confidence: 0.6
- Wants clear visibility into the current state of the project (what's already built) — values a living, up-to-date overview (e.g. README as a map of what exists) so the state never becomes fuzzy. Confidence: 0.6
- Wants AI decision-making exposed rather than black-box — asks for a developer/debug view that surfaces model reasoning traces, the actual system prompts, and per-component verdicts (e.g. parallel classifier checkers) live. Confidence: 0.6
