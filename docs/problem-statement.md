# Problem Statement — BankSim: Blue-Team AI Firewall

**Category:** AI Security & FinTech

> Source of truth for requirements. Official statement pasted verbatim below; released 11 Oct 2026, 10:00 AM on Hack2skill.

## Official statement (verbatim)

Build a Blue-Team defensive AI firewall for a banking interface to intercept, analyze, and sanitize untrusted user inputs before any financial tool or mock transaction executes.

Your system must:

- Detect and block prompt injections, jailbreaks, roleplay attacks, and malicious instructions hidden in transaction memos.
- Safely parse and route legitimate user banking requests (such as balance checks and valid transfers).
- Output deterministic, structured JSON containing the approval status (APPROVED/BLOCKED), risk score, threat category, and explanation.
- Enforce strict guardrails so ambiguous or hostile inputs never compromise system safety.

## Requirement extraction

- **User:** bank customer submitting free-text requests and transaction memos; the bank is the operator whose tools must never be compromised.
- **Core problem:** untrusted natural-language input reaching financial tools — naive interfaces let prompt injections and jailbreaks hijack or spoof transactions.
- **Expected output:** deterministic, structured JSON verdict per input — `status` (APPROVED/BLOCKED), `risk_score`, `threat_category`, `explanation`.
- **Constraints:** blue-team (defensive) only; transactions are mock; strict guardrails; ambiguous or hostile input must fail safe.
- **Threat coverage (explicit):** prompt injection, jailbreaks, roleplay attacks, malicious instructions hidden in transaction memos.
- **Legitimate routing (explicit):** balance checks, valid transfers — parsed and executed as mock tools.
- **How success is demonstrated:** deployed interface where hostile inputs are blocked with correct category + risk score, legitimate requests execute, and the JSON verdict is visible.
- **Edge cases implied:** empty input, ambiguous intent, mixed legit+attack content in one memo, malformed amounts/accounts, obfuscation (unicode, encoding, casing), oversized input.
