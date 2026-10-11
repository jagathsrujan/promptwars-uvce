# Abstract — PromptWars x UVCE

> Deliverable 4. Written from the actual implementation only — the jury checks claims against the demo. Keep it structured and brief.

## Problem understanding

The released problem (AI Security & FinTech): banking interfaces take untrusted natural-language input — including transaction memos — and naive implementations pass it straight to financial tools, so prompt injections, jailbreaks, and roleplay attacks can hijack execution. BankSim builds the blue-team countermeasure: a defensive AI firewall that intercepts, analyzes, and sanitizes every input **before** any mock financial tool runs, emitting a deterministic JSON verdict (APPROVED/BLOCKED, risk score, threat category, explanation) with fail-safe guardrails for ambiguous or hostile input.

## Strategy / proposed approach

*(How does the solution solve it? What is the core user journey?)*

## Novelty — what is distinctive

*(What is original about the idea or the implementation angle? Be specific — this maps to 12.5 marks.)*

## Prompt & AI design

*(How are the AI prompts designed, structured, and tested? Reference `prompts/app/` and the prompt log.)*

## Defensive implementation

*(How the solution handles misuse, ambiguous input, invalid input, empty input, and adversarial input.)*

## What the prototype demonstrates

*(Exactly what works in the live deployment, end to end. No claimed-but-unbuilt features.)*
