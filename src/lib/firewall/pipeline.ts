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
import { classifierState } from "./normalize";
import {
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
} from "./types";

/** Degrade-only test switches — a simulation can block, never approve. */
export type FirewallSimulation = "jev_failure" | "l2_failure" | null;

export async function runFirewall(args: {
  text: string;
  surface: FirewallSurface;
  kind: FirewallInputKind;
  simulate?: FirewallSimulation;
}): Promise<FirewallDecision> {
  const started = Date.now();
  const l0 = runL0(args.text);

  let l1: L1Probabilities | null = null;
  let l2: L2Analysis | null = null;
  let jevFailure = false;
  let l2Failure = false;
  let failureLayer: FirewallFailureLayer = null;

  // Hard L0 blocks and empty inputs never reach a model.
  if (!l0.hardBlocked && !l0.isEmpty) {
    if (args.simulate === "jev_failure") {
      jevFailure = true;
      failureLayer = "jev";
    } else {
      try {
        l1 = await callJev(classifierState(l0.normalized));
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
