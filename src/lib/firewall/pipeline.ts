// The firewall pipeline — L0 → L1 → (L2 on escalation) → verdict.
//
// Runs on EVERY untrusted input before any tool consideration: chat messages,
// transfer-form memos, and console test runs. The verdict it returns is the
// problem statement's required JSON; the FirewallDecision carries the evidence
// (normalized text, per-layer signals, raw probabilities, latency) that the
// console renders and the audit log stores.
//
// Fail closed everywhere: any classifier failure, timeout, or unparseable
// response ends in BLOCKED with deciding_layer FAIL_CLOSED — never an approval.

import { runL0 } from "./l0";
import { FirewallUnavailableError, callJev } from "./l1";
import { callDeepAnalysis } from "./l2";
import { callLaya, layaConfigured } from "./laya";
import { classifierState } from "./normalize";
import {
  composeRisk,
  decideVerdict,
  escalationNeeded,
  rateLimitVerdict,
  topHostileProbability,
  type RateLimitKind,
} from "./verdict";
import {
  THRESHOLDS,
  type FirewallDecision,
  type FirewallFailureLayer,
  type FirewallInputKind,
  type FirewallSurface,
  type FirewallVerdict,
  type L1Probabilities,
  type L2Analysis,
  type ListHits,
  type TokenisedForJev,
} from "./types";

/** Degrade-only test switches — a simulation can block, never approve. */
export type FirewallSimulation = "jev_failure" | "l2_failure" | "laya_failure" | null;

/**
 * Caller-resolved cascade context (Phase 4). All fields optional: console
 * runs and the Phase 3 fallback path omit them and the pipeline behaves
 * exactly as before.
 */
export type CascadeContext = {
  /** PayPal list membership (console runs exempt → omit). */
  lists?: ListHits | null;
  /** Trust conjunction for the Laya fast-approve path. */
  trust?: { allowlistedSalary: boolean; knownDevice: boolean; knownBeneficiary: boolean } | null;
  /** Per-user adaptive deviation points (0 cold/absent). */
  adaptiveBoost?: number;
  /** Pre-tokenised cloud-auditor bundle (omit → pipeline tokenises the text). */
  tokenised?: TokenisedForJev | null;
  /** Cloud-auditor (Jev) risk for gray-zone escalation when L2 is absent. */
  jevRisk?: number | null;
};

export async function runFirewall(args: {
  text: string;
  surface: FirewallSurface;
  kind: FirewallInputKind;
  simulate?: FirewallSimulation;
  cascade?: CascadeContext;
}): Promise<FirewallDecision> {
  const started = Date.now();
  const l0 = runL0(args.text);
  const cascade = args.cascade ?? {};

  // PayPal blocklist: BLOCKED at 100 with zero model cost, before everything.
  if (cascade.lists?.blocklisted) {
    const verdict = decideVerdict({
      l0,
      l1: null,
      l2: null,
      jevFailure: false,
      l2Failure: false,
      evaluateClarity: false,
    });
    // Replace with the list verdict (decideVerdict would fail closed on null
    // l1; the blocklist is a harder, cheaper signal than any classifier).
    const blockVerdict: FirewallVerdict = {
      status: "BLOCKED",
      risk_score: 100,
      threat_category: "VALIDATION_FAILURE",
      explanation: "This account or device is on the bank's blocklist, so the request was refused. Nothing was executed.",
      deciding_layer: "L3",
      signals: [
        ...verdict.signals,
        { layer: "L3", rule: "blocklist_hit", weight: 100, detail: "blocklisted account or device hash" },
      ],
      sanitized_intent: null,
    };
    return {
      verdict: blockVerdict,
      input: args.text.slice(0, 4000),
      surface: args.surface,
      kind: args.kind,
      normalized: l0.normalized.slice(0, 500),
      stripped_chars: l0.strippedChars,
      truncated: l0.truncated,
      l0: {
        hits: l0.hits,
        risk_contribution: l0.riskContribution,
        hard_blocked: l0.hardBlocked,
        escalated: l0.escalates,
        interleaved_invisible: l0.interleavedInvisible,
        folded_chars: l0.foldedChars,
        combining_interleaved: l0.combiningInterleaved,
      },
      l1: null,
      l2: null,
      failure_layer: null,
      ok: false,
      latency_ms: Date.now() - started,
      laya: null,
      tokenised: null,
      adaptive_boost: 0,
      list_hits: cascade.lists,
    };
  }

  let l1: L1Probabilities | null = null;
  let l2: L2Analysis | null = null;
  let jevFailure = false;
  let l2Failure = false;
  let failureLayer: FirewallFailureLayer = null;
  let laya: { probs: L1Probabilities; latency_ms: number } | null = null;
  let layaFailure = false;

  // Phase 4: the local gatekeeper runs first (when configured). Its timeout
  // or garbage fails closed — but only when it was supposed to run; an
  // unconfigured Laya is the Phase 3 path, not a failure.
  if (!l0.hardBlocked && !l0.isEmpty && layaConfigured()) {
    if (args.simulate === "laya_failure") {
      layaFailure = true;
      failureLayer = "laya";
    } else {
      try {
        laya = await callLaya(classifierState(l0.normalized));
      } catch (error) {
        layaFailure = true;
        failureLayer = "laya";
        if (!(error instanceof FirewallUnavailableError)) {
          console.error("Laya gatekeeper failed unexpectedly", error);
        }
      }
    }
  }

  // A Laya outage fails closed immediately — the local gate is the first
  // classifier in the cascade, and a missing first classifier is no basis
  // for any approval.
  if (layaFailure) {
    const verdict = decideVerdict({
      l0,
      l1: null,
      l2: null,
      jevFailure: true,
      l2Failure: false,
      evaluateClarity: args.kind === "message",
    });
    return {
      verdict,
      input: args.text.slice(0, 4000),
      surface: args.surface,
      kind: args.kind,
      normalized: l0.normalized.slice(0, 500),
      stripped_chars: l0.strippedChars,
      truncated: l0.truncated,
      l0: {
        hits: l0.hits,
        risk_contribution: l0.riskContribution,
        hard_blocked: l0.hardBlocked,
        escalated: l0.escalates,
        interleaved_invisible: l0.interleavedInvisible,
        folded_chars: l0.foldedChars,
        combining_interleaved: l0.combiningInterleaved,
      },
      l1: null,
      l2: null,
      failure_layer: failureLayer,
      ok: false,
      latency_ms: Date.now() - started,
      laya: null,
      tokenised: null,
      adaptive_boost: Math.round(cascade.adaptiveBoost ?? 0),
      list_hits: cascade.lists ?? null,
    };
  }

  // Hard L0 blocks and empty inputs never reach a model.
  if (!l0.hardBlocked && !l0.isEmpty) {
    if (args.simulate === "jev_failure") {
      jevFailure = true;
      failureLayer = "jev";
    } else {
      try {
        // Cascade fast path: when Laya already answered cleanly below every
        // threshold AND the caller vouches full trust, skip the cloud call
        // entirely (zero model cost). Everything else still runs L1.
        const layaTop = laya?.probs ? topHostileProbability(laya.probs) : null;
        const layaClean =
          laya !== null &&
          layaTop !== null &&
          layaTop.probability < THRESHOLDS.escalate &&
          composeRisk(l0, laya.probs) + Math.round(cascade.adaptiveBoost ?? 0) < 25;
        const trusted =
          cascade.trust !== null &&
          cascade.trust !== undefined &&
          cascade.trust.allowlistedSalary &&
          cascade.trust.knownDevice &&
          cascade.trust.knownBeneficiary;
        if (layaClean && trusted && laya !== null) {
          // Skip L1: decideVerdict's LAYA_LOCAL branch approves directly.
          l1 = laya.probs;
        } else {
          l1 = await callJev(classifierState(l0.normalized));
        }
      } catch (error) {
        jevFailure = true;
        failureLayer = "jev";
        if (!(error instanceof FirewallUnavailableError)) {
          console.error("L1 classifier failed unexpectedly", error);
        }
      }
    }

    // Deep analysis only when the fast classifier confirmed a gray zone
    // (or L0's own signals demand it) — and never for a deterministic >= 0.90.
    if (l1 && topHostileProbability(l1).probability < THRESHOLDS.hard_block_p) {
      if (escalationNeeded(l0, l1)) {
        if (args.simulate === "l2_failure") {
          l2Failure = true;
          failureLayer = "l2";
        } else {
          try {
            l2 = await callDeepAnalysis({ kind: args.kind, state: l0.normalized, l1 });
          } catch (error) {
            l2Failure = true;
            failureLayer = "l2";
            if (!(error instanceof FirewallUnavailableError)) {
              console.error("L2 deep analysis failed unexpectedly", error);
            }
          }
        }
      }
    }
  }

  const verdict = decideVerdict({
    l0,
    l1,
    l2,
    jevFailure,
    l2Failure,
    evaluateClarity: args.kind === "message",
    layaProbs: laya?.probs ?? null,
    trust: cascade.trust ?? null,
    adaptiveBoost: cascade.adaptiveBoost ?? 0,
    jevRisk: cascade.jevRisk ?? null,
  });

  return {
    verdict,
    input: args.text.slice(0, 4000),
    surface: args.surface,
    kind: args.kind,
    normalized: l0.normalized.slice(0, 500),
    stripped_chars: l0.strippedChars,
    truncated: l0.truncated,
    l0: {
      hits: l0.hits,
      risk_contribution: l0.riskContribution,
      hard_blocked: l0.hardBlocked,
      escalated: l0.escalates,
      interleaved_invisible: l0.interleavedInvisible,
      folded_chars: l0.foldedChars,
      combining_interleaved: l0.combiningInterleaved,
    },
    l1,
    l2,
    failure_layer: failureLayer,
    ok: verdict.status === "APPROVED",
    latency_ms: Date.now() - started,
    laya,
    tokenised: cascade.tokenised ?? null,
    adaptive_boost: Math.round(cascade.adaptiveBoost ?? 0),
    list_hits: cascade.lists ?? null,
  };
}

/** A decision for deterministic L3 outcomes (rate limits, lockouts) — no layers ran. */
export function simpleDecision(args: {
  text: string;
  surface: FirewallSurface;
  kind: FirewallInputKind;
  verdict: FirewallVerdict;
  latencyMs?: number;
}): FirewallDecision {
  return {
    verdict: args.verdict,
    input: args.text.slice(0, 4000),
    surface: args.surface,
    kind: args.kind,
    normalized: "",
    stripped_chars: 0,
    truncated: false,
    l0: {
      hits: [],
      risk_contribution: 0,
      hard_blocked: false,
      escalated: false,
      interleaved_invisible: 0,
      folded_chars: 0,
      combining_interleaved: 0,
    },
    l1: null,
    l2: null,
    failure_layer: null,
    ok: args.verdict.status === "APPROVED",
    latency_ms: args.latencyMs ?? 0,
  };
}

export function rateLimitDecision(args: {
  text: string;
  surface: FirewallSurface;
  kind: FirewallInputKind;
  limit: RateLimitKind;
  detail: string;
}): FirewallDecision {
  return simpleDecision({
    text: args.text,
    surface: args.surface,
    kind: args.kind,
    verdict: rateLimitVerdict(args.limit, args.detail),
  });
}
