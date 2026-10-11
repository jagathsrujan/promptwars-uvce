# Prompts — Configuration Prompts Deliverable

This directory is a **mandatory scored deliverable** (rubric: "Prompt & AI rigor — 10 marks", and the guidebook requires "configuration prompts included in the repository"). Judges open these files directly, so keep them clean, verbatim, and honest.

## What goes where

| Path | Content |
|---|---|
| `vibe-coding/prompt-log.md` | Chronological log of **every prompt used to build this repo** with AI coding agents — verbatim, timestamped, with what each prompt produced. |
| `app/` | The **product's own LLM configuration prompts**: system prompt, few-shot examples, guardrail instructions that ship inside the deployed solution. Version these files; when one changes, add a one-line note to `vibe-coding/prompt-log.md`. |

## Rules

1. Prompts are recorded **verbatim** in fenced code blocks — no paraphrasing, no summaries of what you "meant to type".
2. Every entry carries: timestamp, the verbatim prompt, what it produced, files touched.
3. If a prompt drove a multi-step change, log that one prompt once, listing the full set of files it produced.
4. Failed prompts / dead ends that got you to the working prompt are welcome — they demonstrate prompt iteration, which is exactly what "prompt rigor" means.
