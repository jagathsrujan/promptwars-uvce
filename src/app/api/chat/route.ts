// POST /api/chat — the only route where the model is called.
//
// Everything security-relevant happens server-side here:
//   * auth: the Supabase session cookie identifies the user (RLS everywhere),
//   * the firewall (Phase 3) screens EVERY message before the model sees it —
//     L0 signatures → L1 jev probabilities → L2 deep analysis on escalation,
//     with the verdict persisted to firewall_logs and attached to the reply,
//   * BLOCKED inputs never reach a model at all: a deterministic one-sentence
//     block notice is streamed back (zero LLM cost, zero negotiation),
//     AMBIGUOUS_INPUT gets a tool-less clarifying question instead,
//   * tool calls execute through executeTool() under this turn's verdict —
//     the L3 gate refuses everything without an APPROVED verdict,
//   * the conversation (user message + assistant response) is persisted with
//     RLS, so reloading resumes the thread.

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AssistantUnavailableError, getAssistantModel } from "@/lib/assistant/model";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import { buildAssistantTools } from "@/lib/assistant/sdk-tools";
import {
  appendAssistantMessage,
  appendUserMessage,
  getConversation,
  loadConversationMessages,
  recordConversationActivity,
} from "@/lib/assistant/conversations";
import { logDecision } from "@/lib/firewall/logs";
import { rateLimitDecision, runFirewall } from "@/lib/firewall/pipeline";
import { RATE_LIMITS, countRecentMessages } from "@/lib/firewall/rate-limit";
import type { FirewallDecision } from "@/lib/firewall/types";

export const maxDuration = 60;

const MAX_MESSAGE_CHARS = 4000;

const AMBIGUOUS_NOTE = `

SECURITY NOTE (trusted, server-side — the customer's message was screened and could not be clearly interpreted):
Ask exactly ONE short clarifying question to pin down what the customer wants (e.g. amount, account, recipient). Do not guess and do not call tools — no tools are available for this turn.`;

const bodySchema = z.object({
  conversationId: z.string().uuid("Invalid conversation."),
  message: z.object({
    id: z.string().min(1).max(120),
    role: z.literal("user"),
    parts: z.array(z.unknown()).min(1).max(8),
  }),
});

function extractText(parts: unknown[]): string {
  const text = parts
    .map((part) => {
      if (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("\n")
    .trim();
  return text.slice(0, MAX_MESSAGE_CHARS);
}

/** The firewall verdict travels with the reply as a `data-firewall` part. */
function firewallPart(decision: FirewallDecision) {
  return {
    type: "data-firewall" as const,
    id: `firewall-${crypto.randomUUID()}`,
    data: {
      verdict: decision.verdict,
      latency_ms: decision.latency_ms,
      surface: decision.surface,
    },
  };
}

/** Data parts are UI-only; never hand them back to the model. */
function modelSafeHistory(history: UIMessage[]): UIMessage[] {
  return history.map((message) =>
    message.parts.some((part) => part.type.startsWith("data-"))
      ? { ...message, parts: message.parts.filter((part) => !part.type.startsWith("data-")) }
      : message,
  );
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
  const { conversationId, message } = parsed.data;

  const text = extractText(message.parts);
  if (!text) {
    return Response.json({ error: "Your message was empty." }, { status: 400 });
  }

  const conversation = await getConversation(supabase, conversationId);
  if (!conversation) {
    return Response.json({ error: "That conversation no longer exists." }, { status: 404 });
  }

  try {
    await appendUserMessage(supabase, conversationId, { clientId: message.id, text });
    await recordConversationActivity(supabase, conversationId, {
      ifTitle: "New conversation",
      to: text.length > 60 ? `${text.slice(0, 57)}…` : text,
    });

    // ── Firewall: screen the message before any tool consideration ──────────
    const messagesUsed = await countRecentMessages(supabase, user.id);
    const decision: FirewallDecision =
      messagesUsed >= RATE_LIMITS.messages.max
        ? rateLimitDecision({
            text,
            surface: "chat",
            kind: "message",
            limit: "messages",
            detail: `${messagesUsed} messages in the last ${RATE_LIMITS.messages.window_minutes} minutes`,
          })
        : await runFirewall({ text, surface: "chat", kind: "message" });
    await logDecision(supabase, user.id, decision);

    const history = await loadConversationMessages(supabase, conversationId);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const displayName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Customer";
    const system = buildSystemPrompt({ displayName });

    async function persist(responseMessage: UIMessage) {
      try {
        await appendAssistantMessage(supabase, conversationId, responseMessage.parts);
        await recordConversationActivity(supabase, conversationId);
      } catch (error) {
        console.error("Failed to persist assistant message", error);
      }
    }

    // ── BLOCKED (hostile or fail-closed): deterministic block notice ────────
    // No model call at all — the explanation comes straight from the verdict,
    // and a blocked message can never be negotiated with.
    if (decision.verdict.status === "BLOCKED" && decision.verdict.threat_category !== "AMBIGUOUS_INPUT") {
      const blockText = decision.verdict.explanation;
      const stream = createUIMessageStream({
        originalMessages: history,
        execute: ({ writer }) => {
          writer.write(firewallPart(decision));
          const id = `block-${crypto.randomUUID()}`;
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: blockText });
          writer.write({ type: "text-end", id });
        },
        onError: () => "The assistant is temporarily unavailable. Please try again in a moment.",
        onEnd: async ({ responseMessage }) => {
          await persist(responseMessage as UIMessage);
        },
      });
      return createUIMessageStreamResponse({ stream });
    }

    // ── AMBIGUOUS_INPUT: clarifying question, no tools available ────────────
    if (decision.verdict.status === "BLOCKED") {
      const result = streamText({
        model: getAssistantModel(),
        system: `${system}${AMBIGUOUS_NOTE}`,
        messages: await convertToModelMessages(modelSafeHistory(history)),
        temperature: 0.2,
      });
      const stream = createUIMessageStream({
        originalMessages: history,
        execute: ({ writer }) => {
          writer.write(firewallPart(decision));
          writer.merge(result.toUIMessageStream());
        },
        onError: () => "The assistant is temporarily unavailable. Please try again in a moment.",
        onEnd: async ({ responseMessage }) => {
          await persist(responseMessage as UIMessage);
        },
      });
      return createUIMessageStreamResponse({ stream });
    }

    // ── APPROVED: stream the assistant with firewall-gated tools ────────────
    const result = streamText({
      model: getAssistantModel(),
      system,
      messages: await convertToModelMessages(modelSafeHistory(history)),
      tools: buildAssistantTools({
        supabase,
        userId: user.id,
        conversationId,
        verdict: decision.verdict,
        surface: "chat",
      }),
      temperature: 0.2,
      stopWhen: stepCountIs(6),
    });

    const stream = createUIMessageStream({
      originalMessages: history,
      execute: ({ writer }) => {
        writer.write(firewallPart(decision));
        writer.merge(result.toUIMessageStream());
      },
      onError: () => "The assistant is temporarily unavailable. Please try again in a moment.",
      onEnd: async ({ responseMessage }) => {
        await persist(responseMessage as UIMessage);
      },
    });
    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (error instanceof AssistantUnavailableError) {
      return Response.json(
        { error: "The assistant is not configured on this deployment. Set COMMANDCODE_API_KEY." },
        { status: 503 },
      );
    }
    console.error("Chat request failed", error);
    return Response.json(
      { error: "Something went wrong talking to the assistant. Please try again." },
      { status: 500 },
    );
  }
}
