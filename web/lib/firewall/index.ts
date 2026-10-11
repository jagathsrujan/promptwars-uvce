import { randomUUID } from "node:crypto";
import { aggregate } from "./aggregate";
import { runCheckers } from "./checkers";
import { engineName } from "./llm";
import { normalizeInput, wrapUntrusted } from "./normalize";
import type { FirewallOutcome, InputSignals } from "./types";

const EMPTY_SIGNALS: InputSignals = {
  length: 0,
  hasMemo: false,
  urlDecoded: false,
  base64Decoded: false,
  zeroWidthStripped: false,
  htmlCommentsFound: 0,
  mixedScripts: false,
  tripwires: [],
  normalized: "",
  expanded: "",
  scanText: "",
};

export async function runFirewall(input: string, memo?: string): Promise<FirewallOutcome> {
  const started = Date.now();
  const id = randomUUID().slice(0, 8);
  const norm = normalizeInput(input, memo);

  if (!norm.ok) {
    return {
      id,
      ts: Date.now(),
      mode: "guarded",
      input,
      memo,
      signals: EMPTY_SIGNALS,
      checkers: [],
      verdict: aggregate({ signals: EMPTY_SIGNALS, checkers: [], invalid: norm.reason }),
      engine: engineName(),
      totalMs: Date.now() - started,
    };
  }

  const block = wrapUntrusted(norm.signals.expanded, memo);
  const checkers = await runCheckers(block, memo);
  const verdict = aggregate({ signals: norm.signals, checkers });

  return {
    id,
    ts: Date.now(),
    mode: "guarded",
    input,
    memo,
    signals: norm.signals,
    checkers,
    verdict,
    engine: engineName(),
    totalMs: Date.now() - started,
  };
}
