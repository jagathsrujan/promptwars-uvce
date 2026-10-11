# Official Problem Statement

**Source:** Hack2Skill — PromptWars x UVCE, 11 Oct 2026 (2 scored attempts, 8h sprint)

## CATEGORY

AI Security & FinTech

## TITLE

BankSim: Blue-Team AI Firewall

## PROBLEM STATEMENT

Build a Blue-Team defensive AI firewall for a banking interface to intercept, analyze, and
sanitize untrusted user inputs before any financial tool or mock transaction executes.

Your system must:

- Detect and block prompt injections, jailbreaks, roleplay attacks, and malicious instructions hidden in transaction memos.
- Safely parse and route legitimate user banking requests (such as balance checks and valid transfers).
- Output deterministic, structured JSON containing the approval status (APPROVED/BLOCKED), risk score, threat category, and explanation.
- Enforce strict guardrails so ambiguous or hostile inputs never compromise system safety.

## Core extraction

- **User:** retail banking customer talking to an LLM assistant that can read balances/history and move (mock) money.
- **Core problem:** untrusted text (user input + transaction memos) can hijack the assistant into unauthorized transfers or data leaks; the decision must happen before any tool runs.
- **Expected output:** deterministic JSON per input: `decision` (APPROVED/BLOCKED), `risk_score` 0–100, `threat_category`, `explanation` — plus routing info for approved requests.
- **Constraints:** sanitize and classify before any tool executes; fail closed on ambiguity; hostile input must never reach a money-moving tool; benign requests must still work.
- **Success metric:** red-team recall 1.0 across attack families (direct injection, jailbreak, roleplay/social engineering, memo smuggling, encoding evasion) with zero false blocks on routine balance/transfer/history flows; blocked inputs report `executed_tool: null`.
- **Explicitly out of scope:** real money movement, real bank/core-banking APIs, real user accounts/PII, model training.

## Chosen narrow slice (testable in 8h)

- Core user journey (1 sentence): a customer asks for balance or a valid transfer → the firewall verdict gates a mock tool (`get_balance`, `transfer_funds` after quote+confirm) while any injected, jailbreak, roleplay, or memo-tampered input is BLOCKED with structured evidence and never executes.
- Edge cases to handle: empty input, over-length input, base64/URL-encoded payloads, zero-width/bidi obfuscation, Hindi and typo benigns, HTML-comment memo smuggling, claimed authority ("RBI audit", DAN, "test mode").
- What we will NOT build: real bank integration, persistent user accounts, real PII, live OTP provider, custom model training.
