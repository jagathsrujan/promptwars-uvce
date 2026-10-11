// POST /api/chat/confirm — the user tapped Confirm (or Cancel) on a
// confirmation card.
//
// Security model (Phase 2):
//   * the client only ever sends the opaque token id — never tool params,
//   * redeem_confirmation_token() (SECURITY DEFINER) atomically enforces
//     single-use + 5-minute TTL + user binding, and is the only way params
//     reach execution,
//   * the redeemed params are re-validated and executed through executeTool()
//     with `confirmed: true` — a "yes" typed in chat can never do this.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { executeTool } from "@/lib/assistant/execute-tool";
import {
  appendAssistantMessage,
  recordConversationActivity,
  resolveConfirmationPart,
} from "@/lib/assistant/conversations";
import type { ConfirmationResolution, ToolReceipt } from "@/lib/assistant/types";
import type { FirewallVerdict } from "@/lib/firewall/types";

export const maxDuration = 30;

/**
 * The verdict for a confirmed execution (Phase 3): the proposal behind this
 * token was already screened and approved when the confirmation card was
 * issued, and the params are frozen server-side — so the execution runs under
 * an L3 approval, and the L3 guardrails (lockout, money budget, memo scan)
 * still apply inside executeTool.
 */
const CONFIRMED_EXECUTION_VERDICT: FirewallVerdict = {
  status: "APPROVED",
  risk_score: 0,
  threat_category: "NONE",
  explanation: "Confirmed execution of a previously approved proposal.",
  deciding_layer: "L3",
  signals: [
    {
      layer: "L3",
      rule: "confirmation_token_redeemed",
      weight: 0,
      detail: "single-use confirmation token redeemed by the user",
    },
  ],
  sanitized_intent: null,
};

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  token: z.string().uuid(),
  action: z.enum(["confirm", "cancel"]),
});

function friendlyRpcError(message: string): string {
  const cleaned = message.replace(/^.*?error:\s*/i, "").trim();
  return cleaned || "This confirmation is no longer valid. Please ask the assistant again.";
}

function receiptSummary(receipt: ToolReceipt): string {
  const lines: string[] = [];
  const headline = receipt.amount ? `${receipt.title} — ${receipt.amount}.` : `${receipt.title}.`;
  lines.push(headline);
  if (receipt.reference) lines.push(`Reference ${receipt.reference}.`);
  const newBalance = receipt.details.find((d) => d.label === "New balance");
  if (newBalance) lines.push(`New balance ${newBalance.value}.`);
  return lines.join(" ");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const { conversationId, token, action } = parsed.data;

  // Redeem first: single-use, TTL-checked, bound to this user. This consumes
  // the token even when the execution afterwards fails — a failed money move
  // requires a fresh confirmation, never a retry of the same one.
  const { data: redeemed, error: redeemError } = await supabase.rpc("redeem_confirmation_token", {
    p_token_id: token,
  });

  if (redeemError || !redeemed) {
    const message = friendlyRpcError(redeemError?.message ?? "");
    const state: ConfirmationResolution["state"] = /expired/i.test(message) ? "expired" : "failed";
    await resolveConfirmationPart(supabase, conversationId, token, { state, error: message });
    return Response.json({ ok: false, error: message, resolution: { state, error: message } }, { status: 400 });
  }

  const redemption = redeemed as {
    tool_name?: string;
    params?: Record<string, unknown>;
    conversation_id?: string | null;
  };

  const toolName = redemption.tool_name ?? "";
  const params = redemption.params ?? {};
  // The token's own conversation is authoritative; fall back to the request's.
  const conversation = redemption.conversation_id ?? conversationId;

  if (action === "cancel") {
    await resolveConfirmationPart(supabase, conversation, token, { state: "canceled" });
    const message = await appendAssistantMessage(supabase, conversation, [
      { type: "text", text: "Cancelled — nothing was done. Let me know if you'd like to make any changes." },
    ]);
    await recordConversationActivity(supabase, conversation);
    return Response.json({ ok: true, message, resolution: { state: "canceled" } });
  }

  const result = await executeTool(
    toolName,
    params,
    {
      supabase,
      userId: user.id,
      conversationId: conversation,
      verdict: CONFIRMED_EXECUTION_VERDICT,
      surface: "confirm",
    },
    { confirmed: true },
  );

  if (result.status === "success") {
    await resolveConfirmationPart(supabase, conversation, token, { state: "confirmed" });
    const message = await appendAssistantMessage(supabase, conversation, [
      { type: "text", text: receiptSummary(result.receipt) },
      {
        type: `tool-${result.receipt.tool}`,
        toolCallId: `confirm-${token}`,
        state: "output-available",
        input: params,
        output: result,
      },
    ]);
    await recordConversationActivity(supabase, conversation);
    return Response.json({ ok: true, message, resolution: { state: "confirmed" } });
  }

  if (result.status === "confirmation_required") {
    // Should not happen (confirmed execution never re-issues a token), but never
    // leave the card in a lie: surface it as a failure.
    await resolveConfirmationPart(supabase, conversation, token, {
      state: "failed",
      error: "The confirmation needs to be re-requested.",
    });
    return Response.json(
      { ok: false, error: "That confirmation needs to be re-requested. Please ask the assistant again." },
      { status: 400 },
    );
  }

  if (result.status === "error") {
    await resolveConfirmationPart(supabase, conversation, token, { state: "failed", error: result.message });
    const message = await appendAssistantMessage(supabase, conversation, [
      { type: "text", text: `I couldn't complete that: ${result.message}` },
      {
        type: `tool-${toolName}`,
        toolCallId: `confirm-${token}`,
        state: "output-available",
        input: params,
        output: result,
      },
    ]);
    await recordConversationActivity(supabase, conversation);
    return Response.json({ ok: true, message, resolution: { state: "failed", error: result.message } });
  }

  // A read result can never come out of a confirmation token; treat it as a bug.
  await resolveConfirmationPart(supabase, conversation, token, {
    state: "failed",
    error: "Unexpected result.",
  });
  return Response.json({ ok: false, error: "Something went wrong. Please ask the assistant again." }, { status: 500 });
}
