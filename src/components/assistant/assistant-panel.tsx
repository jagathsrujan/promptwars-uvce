"use client";

// Slide-in assistant panel available from the dashboard shell (any app page).
// It resumes the most recent conversation on first open and shares the exact
// same chat component + route handler as /assistant.

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/cn";
import { buttonStyles, Skeleton } from "@/components/ui/bits";
import { IconPlus, IconRefresh, IconSparkles, IconX, Spinner } from "@/components/icons";
import { AssistantChat } from "@/components/assistant/assistant-chat";

type PanelState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; id: string; messages: UIMessage[]; version: number };

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const loadedRef = useRef(false);

  const createNew = useCallback(async () => {
    setCreating(true);
    try {
      const response = await fetch("/api/chat/conversation", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { conversationId?: string };
      if (!data.conversationId) throw new Error("no conversation");
      setState((prev) => ({
        status: "ready",
        id: data.conversationId as string,
        messages: [],
        version: prev.status === "ready" ? prev.version + 1 : 1,
      }));
    } catch {
      setState({ status: "error" });
    } finally {
      setCreating(false);
    }
  }, []);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/chat/conversation");
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as {
        conversation: { id: string } | null;
        messages?: UIMessage[];
      };
      if (data.conversation) {
        setState({ status: "ready", id: data.conversation.id, messages: data.messages ?? [], version: 0 });
      } else {
        await createNew();
      }
    } catch {
      setState({ status: "error" });
    }
  }, [createNew]);

  useEffect(() => {
    if (open && !loadedRef.current) {
      loadedRef.current = true;
      void load();
    }
  }, [open, load]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="BankSim Assistant"
        className="animate-slide-in-right absolute inset-y-0 right-0 flex w-full flex-col bg-slate-50 shadow-2xl sm:max-w-md sm:border-l sm:border-slate-200"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-white">
              <IconSparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">BankSim Assistant</p>
              <p className="text-xs text-slate-500">Balances, statements, transfers, cards</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void createNew()}
              disabled={creating || state.status === "loading"}
              className={cn(buttonStyles.ghost, "!px-2.5")}
              aria-label="New conversation"
            >
              {creating ? <Spinner className="h-4 w-4" /> : <IconPlus className="h-4 w-4" />}
              <span className="hidden sm:inline">New</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assistant"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        {state.status === "loading" ? (
          <div className="flex-1 space-y-4 p-4" aria-busy="true" aria-label="Loading conversation">
            <Skeleton className="h-16 w-3/4 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-24 w-4/5 rounded-2xl" />
          </div>
        ) : state.status === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-slate-700">Couldn't load the assistant.</p>
            <p className="text-xs text-slate-500">Check your connection and try again.</p>
            <button type="button" onClick={() => void load()} className={buttonStyles.secondary}>
              <IconRefresh className="h-4 w-4" />
              Retry
            </button>
          </div>
        ) : (
          <AssistantChat
            key={state.version}
            conversationId={state.id}
            initialMessages={state.messages}
            className="min-h-0 flex-1"
          />
        )}
      </aside>
    </div>
  );
}
