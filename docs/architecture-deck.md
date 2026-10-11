# Architecture Deck — outline & speaker notes

> Deliverable 3. Build this outline from the real system as it exists — every bullet must survive the 2-minute jury stress test. Required coverage: system design, prompt flow, defensive implementation.

## 1. Title & team

- Project name, one-line pitch, team, event.

## 2. Problem & user

- Official problem: untrusted user input reaches financial tools; the firewall must intercept, analyze, and sanitize **before** any tool or mock transaction executes.
- User: bank customers sending free-text requests/memos; the bank is the operator that must stay uncompromised.
- Core journey demoed live: hostile memo → BLOCKED verdict JSON (risk score + threat category); legit balance check / valid transfer → APPROVED and mock tool executes.
- Explicit threat coverage: prompt injection, jailbreaks, roleplay attacks, malicious instructions hidden in memos; fail-safe on ambiguity.

## 3. System design

- Component diagram: frontend → API → AI/LLM layer → storage.
- Stack choices and why (note: why is what the jury asks).

## 4. Prompt flow

- Where prompts live in the system (link `prompts/app/`).
- Flow diagram: user input → validation → prompt assembly → LLM → parsing → guardrails → response.
- How prompts are structured and tested (few-shot examples, output schemas, iteration evidence from `prompts/vibe-coding/prompt-log.md`).

## 5. Defensive implementation

- Input validation at boundaries.
- Handling: empty input, ambiguous input, invalid input, adversarial/misuse input (e.g. prompt-injection attempts).
- Failure modes and what the user sees when each happens.

## 6. Deployment

- Public URL, hosting platform, how reliability is checked.

## 7. Demo script (5 min)

- *(Scripted clicks through the core journey in the deployed environment — write it, rehearse it.)*

## 8. Known limitations (honest)

- *(What doesn't work yet. Stating limitations beats being caught by the jury.)*

## 9. Q&A prep (2 min edge-case stress test)

- Prepared answers for: "what happens if the model returns garbage?", "what if a user pastes instructions into the input?", "what breaks under load?", "why this model/architecture?"
