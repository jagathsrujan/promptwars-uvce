// Conversation persistence helpers (server-side).
//
// All reads/writes use the caller's RLS-scoped Supabase client, so a
// conversation can only ever be resumed by its owner. Messages are stored in
// the AI SDK's UIMessage `parts` shape, which is what lets the UI re-render a
// full conversation — including tool cards and confirmation receipts — after a
// reload.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UIMessage } from "ai";
import type { Database, Json } from "@/lib/types";
import type { ConfirmationResolution } from "./types";

type Supabase = SupabaseClient<Database>;

export type LoadedConversation = {
  id: string;
  title: string;
  messages: UIMessage[];
};

export async function getLatestConversation(
  supabase: Supabase,
  userId: string,
): Promise<LoadedConversation | null> {
  const { data } = await supabase
    .from("conversations")
    .select("id, title")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    title: data.title,
    messages: await loadConversationMessages(supabase, data.id),
  };
}

export async function loadConversationMessages(
  supabase: Supabase,
  conversationId: string,
): Promise<UIMessage[]> {
  const { data } = await supabase
    .from("chat_messages")
    .select("id, role, parts, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  return (data ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    parts: (m.parts ?? []) as UIMessage["parts"],
  }));
}

export async function createConversation(supabase: Supabase, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Could not start a new conversation.");
  }
  return data.id;
}

/** Most recent conversation, or a fresh one — the chat always has a thread. */
export async function ensureConversation(
  supabase: Supabase,
  userId: string,
): Promise<LoadedConversation> {
  const latest = await getLatestConversation(supabase, userId);
  if (latest) return latest;
  const id = await createConversation(supabase, userId);
  return { id, title: "New conversation", messages: [] };
}

export async function getConversation(
  supabase: Supabase,
  conversationId: string,
): Promise<{ id: string; title: string } | null> {
  const { data } = await supabase
    .from("conversations")
    .select("id, title")
    .eq("id", conversationId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Persist a user message. `clientId` is the useChat message id: a Retry resends
 * the same message object, so the unique (conversation_id, client_id) index
 * turns the duplicate insert into a no-op instead of a duplicate row.
 */
export async function appendUserMessage(
  supabase: Supabase,
  conversationId: string,
  args: { clientId: string; text: string },
): Promise<void> {
  const { error } = await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    role: "user",
    client_id: args.clientId,
    parts: [{ type: "text", text: args.text }] as unknown as Json,
  });
  if (error && error.code !== "23505") {
    throw new Error(`Could not save the message: ${error.message}`);
  }
}

/** Persist an already-streamed assistant UIMessage; returns the stored row. */
export async function appendAssistantMessage(
  supabase: Supabase,
  conversationId: string,
  parts: UIMessage["parts"],
): Promise<UIMessage> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      parts: parts as unknown as Json,
    })
    .select("id, role, parts")
    .single();

  if (error || !data) {
    throw new Error("Could not save the assistant message.");
  }
  return { id: data.id, role: "assistant", parts: data.parts as UIMessage["parts"] };
}

/** Bump recency (drives "most recent conversation"), optionally naming it. */
export async function recordConversationActivity(
  supabase: Supabase,
  conversationId: string,
  rename?: { ifTitle: string; to: string },
): Promise<void> {
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (rename) {
    await supabase
      .from("conversations")
      .update({ title: rename.to })
      .eq("id", conversationId)
      .eq("title", rename.ifTitle);
  }
}

/**
 * Find the confirmation card that owns a token and stamp its resolution onto
 * the stored tool part, so the card renders its final state after a reload.
 */
export async function resolveConfirmationPart(
  supabase: Supabase,
  conversationId: string,
  token: string,
  resolution: ConfirmationResolution,
): Promise<void> {
  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, parts, role")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant");

  for (const message of messages ?? []) {
    const parts = (message.parts ?? []) as Array<Record<string, unknown>>;
    let changed = false;
    const next = parts.map((part) => {
      const output = part?.output as { confirmationToken?: string } | undefined;
      if (typeof part?.type === "string" && part.type.startsWith("tool-") && output?.confirmationToken === token) {
        changed = true;
        return { ...part, output: { ...output, resolution } };
      }
      return part;
    });
    if (changed) {
      await supabase
        .from("chat_messages")
        .update({ parts: next as unknown as Json })
        .eq("id", message.id);
      return;
    }
  }
}
