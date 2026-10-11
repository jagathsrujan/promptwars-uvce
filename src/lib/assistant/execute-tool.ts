// executeTool — the single chokepoint every tool invocation goes through.
//
// Phase 2 contract:
//   * validates params with strict Zod schemas (the model's loose SDK schemas
//     never widen these),
//   * executes under the caller's session (ctx.supabase — auth.uid() + RLS),
//   * for money/account-changing tools: without a redeemed confirmation token
//     it only *proposes* (issues a single-use 5-minute token bound to the exact
//     params) and returns confirmation_required; it executes only when the
//     confirm endpoint has redeemed that token and passes `confirmed: true`.
//
// Phase 3: the firewall's L3 gate (guardToolCall) runs FIRST, inside this
// function — no verdict in ctx, or a non-APPROVED one, means no tool runs.
// The gate also re-scans tool-parameter memos (deterministically) and applies
// the money-operation rate limits and the hostile-block lockout. Confirmed
// executions are recorded in firewall_logs (executed = true), which is what
// the hourly money budget counts.
//
// Nothing else may invoke a tool implementation directly.

import { z } from "zod";
import { guardToolCall } from "@/lib/firewall/l3";
import { logDecision } from "@/lib/firewall/logs";
import { simpleDecision } from "@/lib/firewall/pipeline";
import { approvedVerdict } from "@/lib/firewall/verdict";
import type { Json } from "@/lib/types";
import {
  addBeneficiary,
  addBeneficiaryProposal,
  cashMove,
  cashProposal,
  getTransactions,
  listAccounts,
  listBeneficiaries,
  listCards,
  setCardStatus,
  setCardStatusProposal,
  toolError,
  transferMoney,
  transferProposal,
  type ProposalResult,
} from "./implementations";
import { isMoneyTool, strictSchemas } from "./schemas";
import type {
  MoneyToolName,
  SuccessResult,
  ToolContext,
  ToolErrorResult,
  ToolResult,
} from "./types";

type ParseResult<S> = { ok: true; data: S } | { ok: false; result: ToolErrorResult };

function parse<S extends z.ZodTypeAny>(schema: S, params: unknown): ParseResult<z.infer<S>> {
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      result: toolError("INVALID_PARAMS", first?.message ?? "The request parameters didn't look right."),
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Propose-then-execute for confirmation-gated tools. `confirmed` is only ever
 * set by the server-side confirm endpoint after redeeming the user's token —
 * never from model output or client input.
 */
async function confirmationGated<P>(
  toolName: MoneyToolName,
  params: P,
  ctx: ToolContext,
  confirmed: boolean,
  propose: (p: P) => Promise<ProposalResult>,
  execute: (p: P) => Promise<SuccessResult | ToolErrorResult>,
): Promise<ToolResult> {
  if (confirmed) {
    return execute(params);
  }

  const proposal = await propose(params);
  if (!("ok" in proposal)) {
    return proposal;
  }

  const { data, error } = await ctx.supabase.rpc("issue_confirmation_token", {
    p_tool_name: toolName,
    p_params: params as unknown as Json,
    p_conversation_id: ctx.conversationId,
  });

  const payload = (data ?? null) as { token?: string; expires_at?: string } | null;
  if (error || !payload?.token) {
    return toolError("EXECUTION_FAILED", "I couldn't prepare the confirmation card. Please try again.");
  }

  return {
    status: "confirmation_required",
    confirmationToken: payload.token,
    expiresAt: payload.expires_at ?? "",
    request: proposal.request,
  };
}

/** The tool dispatch — reachable only through executeTool's gate. */
async function dispatchTool(
  toolName: string,
  params: unknown,
  ctx: ToolContext,
  confirmed: boolean,
): Promise<ToolResult> {
  switch (toolName) {
    /* Read tools — no confirmation. */
    case "list_accounts":
      return listAccounts(ctx);

    case "get_transactions": {
      const p = parse(strictSchemas.get_transactions, params);
      return p.ok ? getTransactions(p.data, ctx) : p.result;
    }

    case "list_beneficiaries":
      return listBeneficiaries(ctx);

    case "list_cards":
      return listCards(ctx);

    /* Confirmation-gated tools. */
    case "transfer_money": {
      const p = parse(strictSchemas.transfer_money, params);
      if (!p.ok) return p.result;
      return confirmationGated(
        "transfer_money",
        p.data,
        ctx,
        confirmed,
        (d) => transferProposal(d, ctx),
        (d) => transferMoney(d, ctx),
      );
    }

    case "deposit_cash": {
      const p = parse(strictSchemas.deposit_cash, params);
      if (!p.ok) return p.result;
      return confirmationGated(
        "deposit_cash",
        p.data,
        ctx,
        confirmed,
        (d) => cashProposal("DEPOSIT", d, ctx),
        (d) => cashMove("DEPOSIT", d, ctx),
      );
    }

    case "withdraw_cash": {
      const p = parse(strictSchemas.withdraw_cash, params);
      if (!p.ok) return p.result;
      return confirmationGated(
        "withdraw_cash",
        p.data,
        ctx,
        confirmed,
        (d) => cashProposal("WITHDRAWAL", d, ctx),
        (d) => cashMove("WITHDRAWAL", d, ctx),
      );
    }

    case "add_beneficiary": {
      const p = parse(strictSchemas.add_beneficiary, params);
      if (!p.ok) return p.result;
      return confirmationGated(
        "add_beneficiary",
        p.data,
        ctx,
        confirmed,
        (d) => addBeneficiaryProposal(d, ctx),
        (d) => addBeneficiary(d, ctx),
      );
    }

    case "set_card_status": {
      const p = parse(strictSchemas.set_card_status, params);
      if (!p.ok) return p.result;
      return confirmationGated(
        "set_card_status",
        p.data,
        ctx,
        confirmed,
        (d) => setCardStatusProposal(d, ctx),
        (d) => setCardStatus(d, ctx),
      );
    }

    default:
      return toolError("UNKNOWN_TOOL", `The tool "${toolName}" does not exist.`);
  }
}

/** The audit row for a confirmed execution — what the money budget counts. */
function executionDecision(toolName: string, params: unknown) {
  const summary = JSON.stringify(params ?? {}).slice(0, 300);
  return simpleDecision({
    text: `[executed:${toolName}] ${summary}`,
    surface: "confirm",
    kind: "message",
    verdict: approvedVerdict({
      risk_score: 0,
      layer: "L3",
      explanation: "Confirmed execution of a previously approved proposal.",
      signals: [
        {
          layer: "L3",
          rule: "confirmed_execution",
          weight: 0,
          detail: toolName,
        },
      ],
    }),
  });
}

export async function executeTool(
  toolName: string,
  params: unknown,
  ctx: ToolContext,
  options?: { confirmed?: boolean },
): Promise<ToolResult> {
  const confirmed = options?.confirmed === true;

  // Phase 3: the L3 guardrail runs before anything else — no verdict, no tool.
  const gate = await guardToolCall({
    toolName,
    params,
    verdict: ctx.verdict,
    supabase: ctx.supabase,
    userId: ctx.userId,
    proposal: !confirmed,
  });
  if (!gate.ok) {
    if (gate.log_block) {
      await logDecision(
        ctx.supabase,
        ctx.userId,
        simpleDecision({
          text: `[tool:${toolName}] ${JSON.stringify(params ?? {}).slice(0, 500)}`,
          surface: ctx.surface,
          kind: "message",
          verdict: gate.verdict,
        }),
      );
    }
    return toolError("FIREWALL_BLOCKED", gate.verdict.explanation);
  }

  const result = await dispatchTool(toolName, params, ctx, confirmed);

  // Record confirmed executions (the hourly money budget counts these rows).
  if (confirmed && result.status === "success" && isMoneyTool(toolName)) {
    await logDecision(ctx.supabase, ctx.userId, executionDecision(toolName, params), {
      executed: true,
    });
  }

  return result;
}
