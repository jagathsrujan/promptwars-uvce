# PromptWars x UVCE — Build Sprint Workspace

**Event:** 11 Oct 2026, 10:00 AM – 6:00 PM (8-hour sprint, 2 scored attempts)
**Finale:** Top 10 live defence, 12 Oct 2026 (5 min demo + 3 min arch + 2 min Q&A)

## Quick start

1. Paste the official problem statement into `PROBLEM_STATEMENT.md`
2. Build core journey first in `web/`
3. Log every prompt change in `prompts/`
4. Deploy early — see `docs/submission-checklist.md`
5. Fill `docs/abstract.md` + `docs/architecture-deck.md` from real implementation

## Layout

```
PROBLEM_STATEMENT.md      ← paste official PS here at 10 AM
web/                      ← Next.js app (frontend + /api routes, deploys to Vercel in 1 step)
prompts/                  ← versioned system/user prompts + eval set (REQUIRED deliverable)
docs/
  abstract.md             ← written abstract deliverable
  architecture-deck.md    ← deck outline (system, prompt flow, defensive measures)
  demo-script.md          ← 10-min finale script
  submission-checklist.md ← pre-6PM verification
```

## Run locally

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Health check: http://localhost:3000/api/health

## Deploy (do this BEFORE 4 PM)

```bash
cd web
npx vercel --prod
```

Copy the public URL into your Hack2Skill submission. Verify in a private window.

## Cutoff

6:00 PM sharp, platform auto-locks. Submit with 30-min buffer (target 5:30 PM).
