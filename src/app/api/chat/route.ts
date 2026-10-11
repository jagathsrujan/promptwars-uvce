// POST /api/chat — the only route where the model is called.
//
// Everything security-relevant happens server-side here:
//   * auth: the Supabase session cookie identifies the user (RLS everywhere),
//   * the model + API key never reach the browser,
//   * tool calls execute through executeTool() bound to this user's session,
//   * the conversation (user message + assistant response) is persisted with
//     RLS, so reloading resumes the thread.

import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
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

export const maxDuration = 60;

const MAX_MESSAGE_CHARS = 4000;

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

    const history = await loadConversationMessages(supabase, conversationId);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const displayName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Customer";

    const result = streamText({
      model: getAssistantModel(),
      system: buildSystemPrompt({ displayName }),
      messages: await convertToModelMessages(history),
      tools: buildAssistantTools({ supabase, userId: user.id, conversationId }),
      temperature: 0.2,
      stopWhen: stepCountIs(6),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: history,
        onError: () =>
          "The assistant is temporarily unavailable. Please try again in a moment.",
        onEnd: async ({ responseMessage }) => {
          try {
            await appendAssistantMessage(supabase, conversationId, responseMessage.parts);
            await recordConversationActivity(supabase, conversationId);
          } catch (error) {
            console.error("Failed to persist assistant message", error);
          }
        },
      }),
    });
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
