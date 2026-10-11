import { llmJSON } from "./llm";
import {
  CHECKER_INTENT,
  CHECKER_INTENT_HASH,
  CHECKER_MEMO,
  CHECKER_MEMO_HASH,
  CHECKER_THREAT,
  CHECKER_THREAT_HASH,
} from "./prompts.generated";
import type { CheckerName, CheckerResult } from "./types";

interface Spec {
  name: CheckerName;
  prompt: string;
  hash: string;
  file: string;
  slot: string;
  requiresMemo: boolean;
}

const SPECS: Spec[] = [
  { name: "threat", prompt: CHECKER_THREAT, hash: CHECKER_THREAT_HASH, file: "checker-threat.md", slot: "<<<INPUT>>>", requiresMemo: false },
  { name: "intent", prompt: CHECKER_INTENT, hash: CHECKER_INTENT_HASH, file: "checker-intent.md", slot: "<<<INPUT>>>", requiresMemo: false },
  { name: "memo", prompt: CHECKER_MEMO, hash: CHECKER_MEMO_HASH, file: "checker-memo.md", slot: "<<<MEMO>>>", requiresMemo: true },
];

function parseVote(raw: string): { risk: number; category: string; evidence: string; confidence: number } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no json in response");
  const data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  const risk = Number(data.risk ?? 0);
  if (Number.isNaN(risk)) throw new Error("bad risk value");
  const confidence = Number(data.confidence ?? 0.5);
  return {
    risk: Math.max(0, Math.min(100, risk)),
    category: String(data.category ?? "UNKNOWN").slice(0, 40),
    evidence: String(data.evidence ?? "").slice(0, 160),
    confidence: Number.isNaN(confidence) ? 0.5 : Math.max(0, Math.min(1, confidence)),
  };
}

export async function runCheckers(block: string, memo?: string): Promise<CheckerResult[]> {
  const jobs = SPECS.map(async (spec): Promise<CheckerResult> => {
    if (spec.requiresMemo && !(memo && memo.trim())) {
      return {
        checker: spec.name,
        status: "skipped",
        risk: 0,
        category: "SKIPPED",
        evidence: "",
        confidence: 1,
        raw: "",
        promptFile: spec.file,
        promptHash: spec.hash,
        latencyMs: 0,
      };
    }

    const payload = spec.slot === "<<<MEMO>>>" ? (memo ?? "") : block;
    const system = spec.prompt.split(spec.slot).join(payload);
    const started = Date.now();

    try {
      const res = await llmJSON([{ role: "system", content: system }], 15000);
      const parsed = parseVote(res.text);
      return {
        checker: spec.name,
        status: "ok",
        ...parsed,
        raw: res.text,
        promptFile: spec.file,
        promptHash: spec.hash,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        checker: spec.name,
        status: "error",
        risk: 0,
        category: "ERROR",
        evidence: "",
        confidence: 0,
        raw: "",
        promptFile: spec.file,
        promptHash: spec.hash,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  return Promise.all(jobs);
}
