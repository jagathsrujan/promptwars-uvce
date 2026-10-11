"use client";

// /assistant page shell: owns the active conversation id so the "New
// conversation" button can swap threads by remounting AssistantChat.

import { useState } from "react";
import type { UIMessage } from "ai";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export function AssistantPageClient({
  conversationId,
  messages,
}: {
  conversationId: string;
  messages: UIMessage[];
}) {
  const [state, setState] = useState({ id: conversationId, messages, version: 0 });
  const [creating, setCreating] = useState(false);

  async function handleNewConversation() {
    if (creating) return;
    setCreating(true);
    try {
      const response = await fetch("/api/chat/conversation", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { conversationId?: string };
      if (data.conversationId) {
        setState((prev) => ({ id: data.conversationId as string, messages: [], version: prev.version + 1 }));
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <AssistantChat
      key={state.version}
      conversationId={state.id}
      initialMessages={state.messages}
      showHeader
      onNewConversation={handleNewConversation}
      newConversationBusy={creating}
      className="h-[calc(100dvh-17rem)] min-h-[26rem] max-h-[46rem]"
    />
  );
}
