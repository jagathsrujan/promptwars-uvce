// Composite scorer + decision table — pure, deterministic, unit-tested.
//
// The risk score is a weighted composite: every L0 signature weight, plus each
// jev probability scaled by its threat weight (injection 40, exfiltration 35,
// roleplay 30, social 20), clamped to 0-100. Deep analysis (L2) may set the
// score directly — it saw more context — but can never rescue a deterministic
// hard rule.
//
// Decision rules:
//   1. any L0 hard signature           → BLOCKED (L0)
//   2. empty/unreadable input          → BLOCKED (L0, AMBIGUOUS_INPUT)
//   3. classifier failure/timeouts     → BLOCKED (FAIL_CLOSED)
//   4. any jev probability >= 0.90     → BLOCKED (L1)
//   5. escalation needed (p >= 0.40, a soft L0 signal >= 25, or composite
//      >= 40) and L2 ran               → L2 decides (with contradiction guard)
//   6. low clarity on a message        → BLOCKED (L1, AMBIGUOUS_INPUT)
//   7. otherwise                       → APPROVED (L1)

import {
  BLOCK_EXPLANATIONS,
  QUESTION_CATEGORIES,
  RISK_WEIGHTS,
  THRESHOLDS,
  isFirewallIntent,
  isThreatCategory,
  type FirewallSignal,
  type FirewallVerdict,
  type L0Report,
  type L1Probabilities,
  type L2Analysis,
  type SanitizedIntent,
  type ThreatCategory,
} from "./types";

/* Composite score --------------------------------------------------------------- */

export function composeRisk(l0: L0Report, l1: L1Probabilities | null): number {
  let score = l0.riskContribution;
  if (l1) {
    score +=
      l1.instruction_override * RISK_WEIGHTS.instruction_override +
      l1.exfiltration * RISK_WEIGHTS.exfiltration +
      l1.roleplay_hijack * RISK_WEIGHTS.roleplay_hijack +
      l1.social_pressure * RISK_WEIGHTS.social_pressure;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** The jev question with the highest probability (argmax threat category). */
export function topHostileProbability(l1: L1Probabilities): {
  key: keyof typeof QUESTION_CATEGORIES;
  probability: number;
  category: ThreatCategory;
} {
  const entries = [
    { key: "instruction_override" as const, probability: l1.instruction_override },
    { key: "exfiltration" as const, probability: l1.exfiltration },
    { key: "roleplay_hijack" as const, probability: l1.roleplay_hijack },
    { key: "social_pressure" as const, probability: l1.social_pressure },
  ];
  entries.sort((a, b) => b.probability - a.probability);
  const top = entries[0];
  return { ...top, category: QUESTION_CATEGORIES[top.key] };
}

/* Signal projection -------------------------------------------------------------- */

export function l0Signals(l0: L0Report): FirewallSignal[] {
  return l0.hits.map((hit) => ({
    layer: "L0" as const,
    rule: hit.rule,
    weight: hit.weight,
    span: hit.span,
    detail: hit.detail,
  }));
}

export function l1Signals(l1: L1Probabilities): FirewallSignal[] {
  const signals: FirewallSignal[] = (
    [
      ["instruction_override", l1.instruction_override],
      ["exfiltration", l1.exfiltration],
      ["roleplay_hijack", l1.roleplay_hijack],
      ["social_pressure", l1.social_pressure],
    ] as const
  ).map(([rule, probability]) => ({
    layer: "L1" as const,
    rule,
    weight: RISK_WEIGHTS[rule],
    probability: Math.round(probability * 100) / 100,
    detail:
      `probabilistic classifier: p=${probability.toFixed(2)}` +
      (probability >= THRESHOLDS.hard_block_p
        ? " (>= 0.90 → deterministic block)"
        : probability >= THRESHOLDS.signal
          ? " (confirmed signal)"
          : probability >= THRESHOLDS.escalate
            ? " (escalated to deep analysis)"
            : ""),
  }));
  signals.push({
    layer: "L1",
    rule: "request_clarity",
    weight: 0,
    probability: Math.round(l1.clarity.score * 100) / 100,
    detail: `clarity score ${l1.clarity.score.toFixed(2)} (unclear p=${l1.clarity.unclear.toFixed(2)})`,
  });
  return signals;
}

/* Sanitized intent validation ----------------------------------------------------- */

export function normalizeSanitizedIntent(raw: unknown): SanitizedIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { intent?: unknown; summary?: unknown };
  if (!isFirewallIntent(candidate.intent)) return null;
  const summary =
    typeof candidate.summary === "string" && candidate.summary.trim().length > 0
      ? candidate.summary.trim().slice(0, 200)
      : candidate.intent;
  return { intent: candidate.intent, summary };
}

/* Verdict builders ----------------------------------------------------------------- */

function signal(
  layer: FirewallSignal["layer"],
  rule: string,
  weight: number,
  detail: string,
): FirewallSignal {
  return { layer, rule, weight, detail };
}

export function blockedVerdict(args: {
  category: ThreatCategory;
  risk_score: number;
  layer: FirewallSignal["layer"];
  explanation?: string;
  signals?: FirewallSignal[];
  sanitized_intent?: SanitizedIntent | null;
}): FirewallVerdict {
  return {
    status: "BLOCKED",
    risk_score: Math.max(0, Math.min(100, Math.round(args.risk_score))),
    threat_category: args.category,
    explanation: args.explanation ?? BLOCK_EXPLANATIONS[args.category],
    deciding_layer: args.layer,
    signals: args.signals ?? [],
    sanitized_intent: args.sanitized_intent ?? null,
  };
}

export function approvedVerdict(args: {
  risk_score: number;
  layer: FirewallSignal["layer"];
  explanation: string;
  signals?: FirewallSignal[];
  sanitized_intent?: SanitizedIntent | null;
}): FirewallVerdict {
  return {
    status: "APPROVED",
    risk_score: Math.max(0, Math.min(100, Math.round(args.risk_score))),
    threat_category: "NONE",
    explanation: args.explanation,
    deciding_layer: args.layer,
    signals: args.signals ?? [],
    sanitized_intent: args.sanitized_intent ?? null,
  };
}

export function reviewVerdict(args: {
  category: ThreatCategory;
  risk_score: number;
  layer: FirewallSignal["layer"];
  explanation?: string;
  signals?: FirewallSignal[];
  sanitized_intent?: SanitizedIntent | null;
}): FirewallVerdict {
  return {
    status: "REVIEW",
    risk_score: Math.max(0, Math.min(100, Math.round(args.risk_score))),
    threat_category: args.category,
    explanation:
      args.explanation ??
      "This needs an extra check before it can run — please confirm it again and complete the step-up check.",
    deciding_layer: args.layer,
    signals: args.signals ?? [],
    sanitized_intent: args.sanitized_intent ?? null,
  };
}

/* Rate-limit verdicts (L3 — deterministic, no classifier involved) ---------------- */

export type RateLimitKind = "messages" | "money" | "lockout";

export function rateLimitVerdict(kind: RateLimitKind, detail: string): FirewallVerdict {
  const explanations: Record<RateLimitKind, string> = {
    messages:
      "That's a lot of messages in a short time — please slow down for a couple of minutes, then try again.",
    money:
      "You've reached the hourly limit for money operations on this account — please try again later.",
    lockout:
      "Money operations are temporarily locked after repeated blocked attempts. You can still ask about balances and statements.",
  };
  return blockedVerdict({
    category: "RATE_LIMIT",
    risk_score: 60,
    layer: "L3",
    explanation: explanations[kind],
    signals: [signal("L3", `rate_limit_${kind}`, 60, detail)],
  });
}

/* The decision table --------------------------------------------------------------- */

/** Whether an input must go to deep analysis (shared with the pipeline). */
export function escalationNeeded(l0: L0Report, l1: L1Probabilities): boolean {
  const top = topHostileProbability(l1);
  return (
    top.probability >= THRESHOLDS.escalate ||
    l0.escalates ||
    composeRisk(l0, l1) >= THRESHOLDS.block_score
  );
}

export type DecisionInputs = {
  l0: L0Report;
  l1: L1Probabilities | null;
  l2: L2Analysis | null;
  jevFailure: boolean;
  l2Failure: boolean;
  /** Clarity gating applies to requests, not memos. */
  evaluateClarity: boolean;
  /**
   * Phase 4 cascade inputs (optional — absent on the Phase 3 path).
   * layaProbs: local gatekeeper probabilities (null when LAYA_BASE_URL unset).
   * trust: the PayPal trust conjunction; allowlist fast-approve needs all three.
   * adaptiveBoost: per-user deviation points (0 when cold/absent), added to the composite.
   * jevRisk: cloud auditor (Jev) risk for escalated gray-zone when L2 is absent.
   */
  layaProbs?: L1Probabilities | null;
  trust?: { allowlistedSalary: boolean; knownDevice: boolean; knownBeneficiary: boolean } | null;
  adaptiveBoost?: number;
  jevRisk?: number | null;
};

export function decideVerdict(inputs: DecisionInputs): FirewallVerdict {
  const { l0, l1, l2, jevFailure, l2Failure } = inputs;
  const baseSignals = l0Signals(l0);
  const adaptiveBoost = Math.max(0, Math.min(25, Math.round(inputs.adaptiveBoost ?? 0)));
  const composite = Math.max(0, Math.min(100, composeRisk(l0, l1) + adaptiveBoost));

  // 1. Hard deterministic signatures — zero LLM cost, no exceptions.
  if (l0.hardBlocked) {
    return blockedVerdict({
      category: l0.topCategory ?? "PROMPT_INJECTION",
      risk_score: composite,
      layer: "L0",
      signals: baseSignals,
    });
  }

  // 2. Nothing survived normalization.
  if (l0.isEmpty) {
    return blockedVerdict({
      category: "AMBIGUOUS_INPUT",
      risk_score: 20,
      layer: "L0",
      explanation:
        "The input was empty or contained only invisible characters — there was nothing to analyze.",
      signals: baseSignals,
    });
  }

  // 2b. Phase 4 cascade — Laya fast paths (only when the local gatekeeper ran).
  // Order mirrors the deterministic rules: hard block first, trusted approve
  // second; anything gray falls through to the Jev/L2 path below.
  const layaProbs = inputs.layaProbs ?? null;
  if (layaProbs) {
    const layaSignals = l1Signals(layaProbs).map((s) => ({ ...s, layer: "LAYA_LOCAL" as const }));
    const layaSignalsBase = [...baseSignals, ...layaSignals];
    const layaComposite = Math.max(
      0,
      Math.min(100, composeRisk(l0, layaProbs) + adaptiveBoost),
    );
    const layaTop = topHostileProbability(layaProbs);
    const trust = inputs.trust ?? null;
    const trusted =
      trust !== null && trust.allowlistedSalary && trust.knownDevice && trust.knownBeneficiary;

    // Laya hard block: p >= 0.90 or composite >= 70.
    if (layaTop.probability >= THRESHOLDS.hard_block_p || layaComposite >= 70) {
      return blockedVerdict({
        category: layaTop.probability >= THRESHOLDS.hard_block_p ? layaTop.category : "VALIDATION_FAILURE",
        risk_score: layaComposite,
        layer: "LAYA_LOCAL",
        explanation:
          layaTop.probability >= THRESHOLDS.hard_block_p
            ? `${BLOCK_EXPLANATIONS[layaTop.category]} (local gatekeeper confidence ${(layaTop.probability * 100).toFixed(0)}%.)`
            : "The local security check flagged this request, so it was blocked. Nothing was executed.",
        signals: layaSignalsBase,
      });
    }

    // Laya trusted fast-approve: allowlisted salary + known device + known
    // beneficiary + composite < 25 + top hostile < 0.40.
    if (trusted && layaComposite < 25 && layaTop.probability < THRESHOLDS.escalate) {
      return approvedVerdict({
        risk_score: layaComposite,
        layer: "LAYA_LOCAL",
        explanation: "Checked locally against your trusted profile — treated as a normal banking request.",
        signals: layaSignalsBase,
      });
    }

    // Laya unclear message → AMBIGUOUS_INPUT without cloud cost.
    if (inputs.evaluateClarity && layaProbs.clarity.unclear >= THRESHOLDS.unclear_p) {
      return blockedVerdict({
        category: "AMBIGUOUS_INPUT",
        risk_score: layaComposite,
        layer: "LAYA_LOCAL",
        signals: layaSignalsBase,
      });
    }
  }

  // 3. Fast classifier unavailable → fail closed. Never an approval.
  if (jevFailure || !l1) {
    return blockedVerdict({
      category: l0.topCategory ?? "PROMPT_INJECTION",
      risk_score: Math.max(55, composite),
      layer: "FAIL_CLOSED",
      explanation:
        "Security analysis was unavailable, so the request was blocked (fail closed). Nothing was executed.",
      signals: [...baseSignals, signal("FAIL_CLOSED", "classifier_unavailable", 100, "jev call failed, timed out, or returned an unparseable response")],
    });
  }

  const l1All = l1Signals(l1);
  const signals = [...baseSignals, ...l1All];
  const top = topHostileProbability(l1);

  // 4. Deterministic block on a single very-high probability.
  if (top.probability >= THRESHOLDS.hard_block_p) {
    return blockedVerdict({
      category: top.category,
      risk_score: composite,
      layer: "L1",
      explanation: `${BLOCK_EXPLANATIONS[top.category]} (classifier confidence ${(top.probability * 100).toFixed(0)}%.)`,
      signals,
    });
  }

  // 5. Escalation to deep analysis.
  const needsDeepAnalysis = escalationNeeded(l0, l1);

  if (needsDeepAnalysis) {
    if (l2Failure || !l2) {
      // Phase 4: the cascade's cloud auditor (Jev risk over the tokenised
      // bundle) may resolve the gray zone without L2. Bands: >= 70 BLOCKED,
      // 25–70 REVIEW (step-up; TTL-defaults to BLOCKED), < 25 APPROVED.
      // Absent on the Phase 3 path (jevRisk null) → fail closed as before.
      const jevRisk = inputs.jevRisk;
      if (jevRisk !== null && jevRisk !== undefined && Number.isFinite(jevRisk)) {
        const risk = Math.max(0, Math.min(100, Math.round(jevRisk)));
        const jevSignal = signal(
          "JEV_CLOUD",
          "cloud_audit",
          risk,
          `cloud auditor risk ${risk} over the anonymized feature bundle`,
        );
        const jevSignals = [...signals, jevSignal];
        if (risk >= 70) {
          return blockedVerdict({
            category: l0.topCategory ?? top.category,
            risk_score: risk,
            layer: "JEV_CLOUD",
            signals: jevSignals,
          });
        }
        if (risk >= 25) {
          return reviewVerdict({
            category: l0.topCategory ?? top.category,
            risk_score: risk,
            layer: "JEV_CLOUD",
            signals: jevSignals,
          });
        }
        if (inputs.evaluateClarity && l1.clarity.unclear >= THRESHOLDS.unclear_p) {
          return blockedVerdict({
            category: "AMBIGUOUS_INPUT",
            risk_score: risk,
            layer: "JEV_CLOUD",
            signals: jevSignals,
          });
        }
        return approvedVerdict({
          risk_score: risk,
          layer: "JEV_CLOUD",
          explanation: "Cloud audit of the anonymized request found no material risk.",
          signals: jevSignals,
        });
      }
      return blockedVerdict({
        category: l0.topCategory ?? top.category,
        risk_score: Math.max(55, composite),
        layer: "FAIL_CLOSED",
        explanation:
          "Deep security analysis was unavailable, so the request was blocked (fail closed). Nothing was executed.",
        signals: [
          ...signals,
          signal("FAIL_CLOSED", "deep_analysis_unavailable", 100, "L2 call failed, timed out, or returned an unparseable response"),
        ],
      });
    }

    const l2Signal = signal(
      "L2",
      "deep_analysis",
      l2.risk_score,
      l2.explanation,
    );

    if (l2.status === "BLOCKED") {
      return blockedVerdict({
        category: isThreatCategory(l2.threat_category) ? l2.threat_category : "VALIDATION_FAILURE",
        risk_score: l2.risk_score,
        layer: "L2",
        explanation: l2.explanation,
        signals: [...signals, l2Signal],
        sanitized_intent: null,
      });
    }

    // A contradiction is a failure: an approval that still scores dangerously.
    if (l2.risk_score >= THRESHOLDS.l2_contradiction_score) {
      return blockedVerdict({
        category: "VALIDATION_FAILURE",
        risk_score: l2.risk_score,
        layer: "L2",
        explanation:
          "The deep analysis returned contradictory results, so the request was blocked. Nothing was executed.",
        signals: [...signals, l2Signal],
      });
    }

    // Approved by deep analysis, but only a validated, allowlisted intent can
    // ever unlock tools (L3 enforces the match against the actual tool call).
    if (!l2.sanitized_intent) {
      return blockedVerdict({
        category: "AMBIGUOUS_INPUT",
        risk_score: l2.risk_score,
        layer: "L2",
        signals: [...signals, l2Signal],
      });
    }

    return approvedVerdict({
      risk_score: l2.risk_score,
      layer: "L2",
      explanation: l2.explanation,
      signals: [...signals, l2Signal],
      sanitized_intent: l2.sanitized_intent,
    });
  }

  // 6. Clean path — clarity gate on messages only.
  if (inputs.evaluateClarity && l1.clarity.unclear >= THRESHOLDS.unclear_p) {
    return blockedVerdict({
      category: "AMBIGUOUS_INPUT",
      risk_score: composite,
      layer: "L1",
      signals,
    });
  }

  // 7. Approved. `sanitized_intent` stays null: tool use is constrained by the
  //    L3 guardrails (allowlist, Zod, confirmation tokens), not by a guess.
  return approvedVerdict({
    risk_score: composite,
    layer: "L1",
    explanation: "No threats detected — treated as a normal banking request.",
    signals,
  });
}
