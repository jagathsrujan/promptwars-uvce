# Round 2 Day-Of Checklist — 10-Minute Slot (5 demo · 3 defense · 2 Q&A)

## Night before / morning

- [ ] Live URL verified on a SECOND device (phone): login → balance → assistant → transfer → receipt
- [ ] Deck exported: browser open at `docs/round2/deck.html` + PDF backup (`Print → Save as PDF`, background graphics ON) + cloud copy (Drive link)
- [ ] Tabs pre-loaded & logged in (`aarav@banksim.demo` / `BankSim@123`): `/assistant` · `/transfer` · `/firewall` · deck
- [ ] Laptop charged + charger packed · hotspot on + tested · student ID in bag
- [ ] `npm test` green (171) noted; `COMMANDCODE_API_KEY` confirmed set in Vercel (L1 provider path live)

## 10 minutes before slot

- [ ] Close all apps except browser · silence notifications · zoom level 100–110%
- [ ] Re-verify live URL loads (one refresh per tab)
- [ ] Decide speaker order & who holds the clicker / types

## During — time discipline

| Clock | Segment | Anchor |
|---|---|---|
| 0:00 | Frame (30 s) | Deck slide 1 → "Watch what the firewall does with it" |
| 0:30 | Legit path | `/assistant`: balance → transfer → Confirm tap → receipt |
| 1:30 | Console rapid-fire | `/firewall`: injection → jailbreak → homoglyph → base64 (expand row) → ambiguous |
| 3:00 | Memo story | `/transfer`: clean memo succeeds → attack memo refused + verdict JSON |
| 3:45 | Fail closed | `/firewall` switches: jev down → BLOCKED; L2 down → BLOCKED |
| 4:30 | Architecture breath | Deck slide 3 → one-breath close |
| 5:00 | Defense script | `defense-script.md` — prompts → probabilities → enforcement → tests |
| 8:00 | Q&A | `qa-bank.md` — DEMONSTRATE, don't describe; invite their attack |

## Rules of the room

1. If anything stalls >10 s: say "moving on" — every beat is independent.
2. Never claim what isn't live — jury checks claims against the demo.
3. Name numbers exactly: 25/25 · 171 tests · L0 ~ms · clean path ~0.6 s · thresholds (≥40 · p≥0.90 · ≥0.40 · unclear ≥0.50).
4. End every answer at a clickable tab. Last word if offered: "Row 6 — the model failed and we still blocked. That's the thesis."
