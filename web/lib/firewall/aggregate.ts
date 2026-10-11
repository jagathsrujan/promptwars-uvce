import type { CheckerResult, InputSignals, Verdict, Zone } from "./types";

const WEIGHTS: Record<string, number> = { threat: 0.45, intent: 0.3, memo: 0.25 };
const THRESHOLD_VERIFY = 35;
const THRESHOLD_BLOCK = 75;
const STRONG_SIGNAL = 80;

const BENIGN_CATEGORIES = new Set(["NONE", "LEGIT", "BENIGN_MEMO", "EMPTY", "OUT_OF_SCOPE", "SKIPPED"]);

export interface AggregateInput {
  signals: InputSignals;
  checkers: CheckerResult[];
  invalid?: "empty" | "too_long";
}

export function aggregate({ signals, checkers, invalid }: AggregateInput): Verdict {
  if (invalid) {
    return {
      decision: "BLOCKED",
      zone: "block",
      risk_score: 100,
      threat_category: "INVALID_INPUT",
      explanation: invalid === "empty" ? "Empty input failed closed." : "Over-length input failed closed.",
      reasons: [`invalid input: ${invalid}`],
    };
  }

  const active = checkers.filter((c) => c.status === "ok");
  const errored = checkers.filter((c) => c.status === "error");
  const reasons: string[] = [];

  const weightSum = active.reduce((sum, c) => sum + (WEIGHTS[c.checker] ?? 0.2), 0) || 1;
  let score = active.reduce((sum, c) => sum + c.risk * (WEIGHTS[c.checker] ?? 0.2), 0) / weightSum;

  for (const c of active) {
    if (c.risk >= THRESHOLD_VERIFY) {
      reasons.push(`${c.checker}: ${c.category} risk ${Math.round(c.risk)} — "${c.evidence}"`);
    }
  }

  if (signals.tripwires.length) {
    const bonus = Math.min(24, signals.tripwires.length * 12);
    score += bonus;
    reasons.push(`tripwires: ${signals.tripwires.join(", ")} (+${bonus})`);
  }
  if (signals.base64Decoded || signals.urlDecoded) {
    score += 10;
    reasons.push("encoded payload decoded (+10)");
  }
  if (signals.zeroWidthStripped) {
    score += 8;
    reasons.push("invisible characters stripped (+8)");
  }
  if (signals.htmlCommentsFound) {
    score += 10;
    reasons.push("HTML-comment payload found (+10)");
  }
  if (signals.mixedScripts) {
    score += 6;
    reasons.push("mixed scripts (+6)");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let zone: Zone = score >= THRESHOLD_BLOCK ? "block" : score >= THRESHOLD_VERIFY ? "verify" : "allow";

  const strong = active.find((c) => c.risk >= STRONG_SIGNAL);
  if (strong) {
    zone = "block";
    score = Math.max(score, THRESHOLD_BLOCK);
    reasons.push(`${strong.checker}: strong signal ≥ ${STRONG_SIGNAL} (risk ${Math.round(strong.risk)}) → block`);
  }

  if (errored.length) {
    zone = "block";
    for (const c of errored) {
      reasons.push(`${c.checker}: checker failed (${c.error}) — failing closed`);
    }
  }

  const ranked = [...active].sort((a, b) => b.risk - a.risk);
  const top = ranked[0];

  let threatCategory = "BENIGN";
  if (zone !== "allow") {
    if (errored.length && (!top || top.risk < THRESHOLD_VERIFY)) threatCategory = "PIPELINE_ERROR";
    else if (top && !BENIGN_CATEGORIES.has(top.category)) threatCategory = top.category;
    else if (signals.tripwires.length) threatCategory = "TRIPWIRE";
    else threatCategory = "RISK_SCORE";
  }

  const decision = zone === "block" ? "BLOCKED" : zone === "verify" ? "VERIFY" : "APPROVED";
  const explanation =
    zone === "allow"
      ? `Approved at risk ${score}: no manipulation signals.`
      : `${zone === "block" ? "Blocked" : "Verification required"} at risk ${score}${reasons[0] ? ` — ${reasons[0]}` : ""}.`;

  return { decision, zone, risk_score: score, threat_category: threatCategory, explanation, reasons };
}
