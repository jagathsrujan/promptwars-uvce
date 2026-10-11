# Jury Q&A Bank — 2-Minute Stress Test (with live demo move for each)

> Rule: never just describe — DEMONSTRATE. Every answer ends at a tab you can click. Keep answers under 30 seconds each.

## Prompt efficacy & design

1. **"What if the model returns garbage / hallucinates a verdict?"**
   Every classifier output is Zod-validated; invalid, timeout, or unparseable → `FAIL_CLOSED BLOCKED`. _Demo:_ flip "Deep analysis down" in `/firewall`, run input → BLOCKED.
2. **"What if an attacker pastes instructions into the input?"**
   Provenance-vs-intent is decided by rules, not vibes: L0 blocks phrase patterns in ms with zero model cost; survivors get scored by jev, then deep-analyzed. Matrix rows 1–13 are exactly this. _Demo:_ run injection preset → L0, 4 ms.
3. **"What if they rephrase cleverly, no signature words?"**
   The probability gate scores meaning, not strings — row 8 (social engineering) and row 20 (third-party data) contain no signature words and still blocked. _Demo:_ expand base64 row → raw jev probs + L2 reasoning visible.
4. **"Why two models instead of one big classifier?"**
   Cheap probabilistic gate on every input (~0.6 s); expensive analyst only on gray zones (3–5 s). Clean path stays under 1 s; known attacks cost ~0 ms.
5. **"Why temperature 0.1 / 0.2? What breaks if you raise them?"**
   L2 at 0.1 = near-deterministic classification; higher temp risks shape drift in the JSON contract (caught by Zod → fail-closed, but wastes the call). Chat at 0.2 = stable tool-calling with natural phrasing.

## Live implementation & robustness

6. **"Can the assistant be talked out of the firewall?"**
   Blocked inputs never reach the model (canned server-side reply); the model is prompt-hardened against meta-probing; even a fully hijacked model hits L3 — no APPROVED verdict, no tool; no Confirm tap, no money. _Demo:_ type attack in `/assistant` → refusal + chip, no model involvement.
7. **"What breaks under load?"**
   Rate limits (30 msg/5 min, 10 money ops/hr) + timeouts (3 s provider / 10 s backup / 8 s L2) bound worst-case latency; bursts → `RATE_LIMIT` block with audit flag; 5 hostile blocks → 15-min money lockout, read-only chat preserved.
8. **"What happens when your API keys are down?"**
   jev outage → FAIL_CLOSED (verified matrix #24); L2 outage → FAIL_CLOSED (#25); L0 still blocks known patterns with zero keys. _Demo:_ "jev down" switch → benign input BLOCKED.
9. **"Show me an attack I just made up."**
   Invite them to type anything into `/firewall` console run box. If it's legit → APPROVED (good, shows no over-blocking); if hostile → blocked with category. Either outcome proves the system.

## Technical depth

10. **"Why jev probabilities instead of an LLM judge?"**
    Probabilities are branchable deterministically, cheap, and have no text channel to inject. Same parser/thresholds on both routes; deterministic code owns every hard decision.
11. **"Latency budget — where does time go?"**
    L0 ~0–10 ms · L1 ~0.6 s provider (~4–6 s backup) · L2 3–5 s escalations only. Clean path ~0.6 s total, inside the 1 s budget; console shows per-decision latency for every row.
12. **"How do you know it works — not just today?"**
    171 unit tests (`npm test`), 25-case live matrix (`npm run test:live`), hosted RLS checks on two real accounts, every decision persisted with evidence in `firewall_logs`.
13. **"Biggest limitation, honestly?"**
    L0 is English-centric (curated homoglyph map; unusual scripts rely on obfuscation signals + L1/L2). Gray zones cost 3–5 s by design. Over-blocking on outages is intentional. Next: vernacular signatures, streaming verdicts, per-bank threshold tuning.
14. **"Why should this win over a pure-ML detector?"**
    Three things: (a) probabilities-as-primitive — no text channel to attack; (b) verdict-as-product — same auditable JSON for chat, memo, console, execution; (c) defense in depth where each layer is independently boring — deterministic code makes hard decisions, models contribute evidence. A hijacked model can't move money.

## Killer closers (if given the last word)

- "Row 6 of our matrix is my favorite result — the model failed, and the firewall still blocked correctly. That's the whole thesis."
- "Every number on these slides reproduces with two commands: `npm test`, `npm run test:live`."
