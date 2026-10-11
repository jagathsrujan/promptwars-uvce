// L3 — deterministic execution guardrails. Applied AFTER any verdict, and
// unbypassable: the only way to run a tool is through executeTool(), and every
// tool call passes through this gate first.
//
//   1. the current turn's verdict must exist and be APPROVED — an APPROVED
//      verdict is necessary but never sufficient;
//   2. if deep analysis pinned a sanitized intent, the tool family must match
//      it (a TRANSFER-approval can never run set_card_status);
//   3. tool-parameter memos are scanned again (L0, deterministic) — a memo is
//      text that outlives the request, so it never carries instructions;
//   4. money/account tools additionally respect the rate limits and the
//      15-minute hostile-block lockout.
//
// Money movement itself still requires the Phase 2 confirmation token: L3 is
// one more independent layer, not a replacement for any other.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { runL0 } from "./l0";
import { RATE_LIMITS, getRateLimitState } from "./rate-limit";
import {
  BLOCK_EXPLANATIONS,
  THRESHOLDS,
  type FirewallIntent,
  type FirewallVerdict,
} from "./types";
import { blockedVerdict, l0Signals, normalizeSanitizedIntent, rateLimitVerdict, reviewVerdict } from "./verdict";
import { MONEY_TOOL_NAMES } from "@/lib/assistant/schemas";
import type { AssistantToolName } from "@/lib/assistant/types";

type Supabase = SupabaseClient<Database>;

/** Tool → the allowlisted intent it realizes. Reads have no intent pin. */
export const TOOL_INTENTS: Record<AssistantToolName, FirewallIntent | null> = {
  list_accounts: "BALANCE_CHECK",
  get_transactions: "TRANSACTION_HISTORY",
  list_beneficiaries: null,
  list_cards: null,
  transfer_money: "TRANSFER",
  deposit_cash: "DEPOSIT",
  withdraw_cash: "WITHDRAW",
  add_beneficiary: "ADD_BENEFICIARY",
  set_card_status: "SET_CARD_STATUS",
};

const KNOWN_TOOLS = new Set(Object.keys(TOOL_INTENTS));

const MONEY_TOOLS = new Set<string>(MONEY_TOOL_NAMES);

export type ToolGateResult =
  | { ok: true }
  | { ok: false; verdict: FirewallVerdict; log_block: boolean };

/** Read tools stay available under REVIEW (step-up only gates money). */
const READ_TOOLS = new Set(["list_accounts", "get_transactions", "list_beneficiaries", "list_cards"]);

function deny(verdict: FirewallVerdict, logBlock = true): ToolGateResult {
  return { ok: false, verdict, log_block: logBlock };
}

/* Money allowance (shared by the tool gate and the Phase 1 transfer form) ---------- */

export type MoneyAllowance = { ok: true } | { ok: false; verdict: FirewallVerdict };

export async function checkMoneyAllowance(
  supabase: Supabase,
  userId: string,
): Promise<MoneyAllowance> {
  const state = await getRateLimitState(supabase, userId);

  if (state.locked_until) {
    return {
      ok: false,
      verdict: rateLimitVerdict(
        "lockout",
        `tool lockout after ${state.recent_hostile_blocks} hostile blocks; locked until ${state.locked_until}`,
      ),
    };
  }
  if (state.money_ops_used >= RATE_LIMITS.money_ops.max) {
    return {
      ok: false,
      verdict: rateLimitVerdict(
        "money",
        `${state.money_ops_used}/${RATE_LIMITS.money_ops.max} money operations executed in the last hour`,
      ),
    };
  }
  return { ok: true };
}

/* Memo scanning for tool parameters -------------------------------------------------- */

/**
 * L0 scan of a tool-parameter memo. Deterministic and cheap — it runs at
 * proposal AND at execution, so a hostile memo can never reach the ledger,
 * whatever path the parameters took. Signals below the escalation weight
 * (e.g. a stray invisible character) are allowed through; anything at/above 25
 * or any hard signature blocks.
 */
export function scanToolMemo(params: unknown): FirewallVerdict | null {
  const memo = (params as { memo?: unknown } | null)?.memo;
  if (typeof memo !== "string" || memo.trim().length === 0) return null;

  const l0 = runL0(memo);
  const blocking = l0.hits.filter((hit) => hit.hard || hit.weight >= THRESHOLDS.soft_escalate_weight);
  if (blocking.length === 0) return null;

  const top = blocking.reduce((a, b) => (b.weight > a.weight ? b : a));
  return blockedVerdict({
    category: top.category,
    risk_score: Math.max(70, l0.riskContribution),
    layer: "L3",
    explanation: BLOCK_EXPLANATIONS.HIDDEN_INSTRUCTION,
    signals: l0Signals(l0),
  });
}

/* The gate --------------------------------------------------------------------------- */

export async function guardToolCall(args: {
  toolName: string;
  params: unknown;
  verdict: FirewallVerdict | null;
  supabase: Supabase;
  userId: string;
  /** True when this call only proposes (issues a confirmation token). */
  proposal: boolean;
}): Promise<ToolGateResult> {
  // Unknown tools are rejected by executeTool's switch; never gate them here.
  if (!KNOWN_TOOLS.has(args.toolName)) {
    return deny(
      blockedVerdict({
        category: "VALIDATION_FAILURE",
        risk_score: 80,
        layer: "L3",
        signals: [],
      }),
      false,
    );
  }

  // 1. A missing verdict is a fail-closed state, not an open door. A
  // non-APPROVED verdict refuses everything — except REVIEW, which denies
  // money tools with a step-up prompt (the Phase 2 confirm token + OTP)
  // while leaving read tools available.
  if (!args.verdict) {
    return deny(
      blockedVerdict({
        category: "VALIDATION_FAILURE",
        risk_score: 80,
        layer: "FAIL_CLOSED",
        explanation:
          "The security check did not approve this request, so no action can run. Nothing was executed.",
      }),
    );
  }

  if (args.verdict.status === "REVIEW") {
    if (READ_TOOLS.has(args.toolName)) return { ok: true };
    return deny(
      reviewVerdict({
        category: args.verdict.threat_category,
        risk_score: args.verdict.risk_score,
        layer: "L3",
        explanation:
          "This needs an extra check before money can move — please confirm it again and complete the step-up check. Nothing was executed.",
        signals: [
          {
            layer: "L3",
            rule: "review_step_up",
            weight: args.verdict.risk_score,
            detail: `REVIEW verdict from ${args.verdict.deciding_layer}: money tools denied until step-up completes`,
          },
        ],
      }),
    );
  }

  if (args.verdict.status !== "APPROVED") {
    return deny(
      blockedVerdict({
        category: "VALIDATION_FAILURE",
        risk_score: 80,
        layer: "FAIL_CLOSED",
        explanation:
          "The security check did not approve this request, so no action can run. Nothing was executed.",
      }),
    );
  }

  const verdict = args.verdict;

  // 2. Intent pin from deep analysis (when present) must match the tool family.
  const pinned = normalizeSanitizedIntent(verdict.sanitized_intent);
  const toolIntent = TOOL_INTENTS[args.toolName as AssistantToolName] ?? null;
  if (pinned && toolIntent && pinned.intent !== toolIntent) {
    return deny(
      blockedVerdict({
        category: "VALIDATION_FAILURE",
        risk_score: 70,
        layer: "L3",
        explanation:
          "That action doesn't match what was approved for this request, so it was blocked. Nothing was executed.",
        signals: [
          {
            layer: "L3",
            rule: "intent_mismatch",
            weight: 70,
            detail: `approved intent ${pinned.intent} vs tool intent ${toolIntent}`,
          },
        ],
      }),
    );
  }

  // 3. Memos never carry instructions.
  const memoVerdict = scanToolMemo(args.params);
  if (memoVerdict) return deny(memoVerdict);

  // 4. Money/account tools: lockout + hourly budget (proposals included).
  if (MONEY_TOOLS.has(args.toolName)) {
    const allowance = await checkMoneyAllowance(args.supabase, args.userId);
    if (!allowance.ok) return deny(allowance.verdict);
  }

  return { ok: true };
}
