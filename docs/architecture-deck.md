# Architecture Deck Outline (submission deliverable #3)

Copy into Google Slides / Canva. 6 slides max — judges get 3 min for this section.

## 1. Problem → Solution (1 slide)
- User, pain, narrow slice, live URL + QR

## 2. System design (1 slide)
- Diagram: Client (Next.js) → /api/solve → LLM → structured output → UI
- Where keys live (server-side only), timeouts, fallbacks

## 3. Prompt flow (1 slide)
- System → user → tool/output schema → validation → retry
- Reference files in `prompts/` (versioned, eval-tested)
- Show 1 real before/after prompt improvement

## 4. Defensive implementation (1 slide)
- Invalid / ambiguous / adversarial inputs: what happens
- Rate limits, input length caps, PII redaction, no-key-exposure
- Failure mode demo (have one ready for Q&A)

## 5. Eval & trade-offs (1 slide)
- `prompts/eval-set.json` results: pass rate, what was fixed
- What was cut and why

## 6. Demo + next steps (1 slide)
- Core journey screenshot, marks mapping (innovation / depth / rigor / deployment)
