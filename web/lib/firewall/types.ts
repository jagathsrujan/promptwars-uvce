export type Mode = "guarded" | "raw";

export type Decision = "APPROVED" | "BLOCKED" | "VERIFY";

export type Zone = "allow" | "verify" | "block";

export interface InputSignals {
  length: number;
  hasMemo: boolean;
  urlDecoded: boolean;
  base64Decoded: boolean;
  zeroWidthStripped: boolean;
  htmlCommentsFound: number;
  mixedScripts: boolean;
  tripwires: string[];
  normalized: string;
  expanded: string;
  scanText: string;
}

export type CheckerName = "threat" | "intent" | "memo";

export type CheckerStatus = "ok" | "skipped" | "error";

export interface CheckerResult {
  checker: CheckerName;
  status: CheckerStatus;
  risk: number;
  category: string;
  evidence: string;
  confidence: number;
  raw: string;
  promptFile: string;
  promptHash: string;
  latencyMs: number;
  error?: string;
}

export interface Verdict {
  decision: Decision;
  zone: Zone;
  risk_score: number;
  threat_category: string;
  explanation: string;
  reasons: string[];
}

export interface AgentOutcome {
  actionRequested: { name: string; args: Record<string, unknown> } | null;
  actionExecuted: string | null;
  gateNote: string;
}

export interface FirewallOutcome {
  id: string;
  ts: number;
  mode: Mode;
  input: string;
  memo?: string;
  signals: InputSignals;
  checkers: CheckerResult[];
  verdict: Verdict;
  engine: string;
  totalMs: number;
  agent?: AgentOutcome;
}

export interface LlmResult {
  text: string;
  model: string;
  engine: "model" | "stub";
  latencyMs: number;
}
