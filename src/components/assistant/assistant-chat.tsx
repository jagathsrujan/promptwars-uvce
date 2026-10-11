"use client";

// The shared BankSim Assistant chat surface, used by both /assistant and the
// slide-in panel. It talks to /api/chat (streaming + server-executed tools) and
// /api/chat/confirm (confirmation tokens). Confirmation cards can only be
// actioned here, by a real user tap — never by the model.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { cn } from "@/lib/cn";
import { buttonStyles } from "@/components/ui/bits";
import { useToast } from "@/components/ui/toast";
import {
  IconAlert,
  IconPlus,
  IconSend,
  IconSparkles,
  IconX,
  Spinner,
} from "@/components/icons";
import { ToolPartCard, type ToolPartLike } from "@/components/assistant/tool-cards";
import { FirewallChip } from "@/components/firewall/verdict-json";
import type { FirewallVerdict } from "@/lib/firewall/types";

const SUGGESTIONS = [
  "What's my balance?",
  "Show my last 10 transactions for checking",
  "Pay Rahul ₹500 from savings with memo dinner",
  "List my beneficiaries",
] as const;

/** Minimal inline markdown: **bold** and `code` — models emit these constantly. */
function renderInlineMarkdown(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`\n]+`)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code key={key++} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-700">
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function friendlyError(message: string | undefined): string {
  if (!message) return "Please try again in a moment.";
  const trimmed = message.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown };
      if (typeof parsed.error === "string") return parsed.error;
    } catch {
      // fall through
    }
  }
  return trimmed.length > 200 ? "Please try again in a moment." : trimmed;
}

type Resolution = { state: "confirmed" | "canceled" | "expired" | "failed"; error?: string };

function patchConfirmation(messages: UIMessage[], token: string, resolution: Resolution): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      const candidate = part as unknown as { type?: string; output?: { confirmationToken?: string } };
      if (
        typeof candidate.type === "string" &&
        candidate.type.startsWith("tool-") &&
        candidate.output?.confirmationToken === token
      ) {
        return {
          ...candidate,
          output: { ...candidate.output, resolution },
        } as unknown as UIMessage["parts"][number];
      }
      return part;
    }),
  }));
}

function MessageParts({
  message,
  pendingToken,
  onResolve,
}: {
  message: UIMessage;
  pendingToken: string | null;
  onResolve: (token: string, action: "confirm" | "cancel") => void;
}) {
  if (message.role === "user") {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n");
    if (!text) return null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy-900 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          if (!part.text) return null;
          return (
            <div
              key={`text-${index}`}
              className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-800 shadow-sm"
            >
              {renderInlineMarkdown(part.text)}
            </div>
          );
        }
        if (part.type === "data-firewall") {
          const data = (part as { data?: { verdict?: FirewallVerdict; latency_ms?: number } }).data;
          if (!data?.verdict) return null;
          return (
            <FirewallChip
              key={`firewall-${index}`}
              verdict={data.verdict}
              latencyMs={data.latency_ms}
            />
          );
        }
        if (part.type === "step-start") return null;
        if (part.type.startsWith("tool-")) {
          return (
            <ToolPartCard
              key={(part as { toolCallId?: string }).toolCallId ?? `tool-${index}`}
              part={part as unknown as ToolPartLike}
              pendingToken={pendingToken}
              onResolve={onResolve}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

export function AssistantChat({
  conversationId,
  initialMessages,
  showHeader = false,
  onNewConversation,
  newConversationBusy = false,
  className,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  showHeader?: boolean;
  onNewConversation?: () => void;
  newConversationBusy?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { conversationId, message: messages[messages.length - 1] },
        }),
      }),
    [conversationId],
  );

  const { messages, sendMessage, status, error, regenerate, stop, setMessages } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
  });

  const busy = status === "streaming" || status === "submitted";

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, status]);

  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      void sendMessage({ text: trimmed });
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    },
    [busy, sendMessage],
  );

  const handleResolve = useCallback(
    async (token: string, action: "confirm" | "cancel") => {
      if (pendingToken) return;
      setPendingToken(token);
      try {
        const response = await fetch("/api/chat/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, token, action }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: UIMessage;
          resolution?: Resolution;
        };

        if (data.resolution) {
          const resolution = data.resolution;
          setMessages((prev) => patchConfirmation(prev, token, resolution));
        }
        if (data.message) {
          const appended = data.message;
          setMessages((prev) => [...prev, appended]);
        }

        if (!response.ok || !data.ok) {
          toast({
            title: action === "confirm" ? "Couldn't confirm" : "Couldn't cancel",
            description: data.error ?? "Please try again.",
            variant: "error",
          });
        } else {
          toast({
            title: action === "confirm" ? "Done" : "Cancelled",
            description:
              action === "confirm"
                ? "The action was completed."
                : "Nothing was executed.",
            variant: action === "confirm" ? "success" : "info",
          });
          router.refresh();
        }
      } catch {
        toast({
          title: "Network problem",
          description: "Couldn't reach the server. Please try again.",
          variant: "error",
        });
      } finally {
        setPendingToken(null);
      }
    },
    [conversationId, pendingToken, router, setMessages, toast],
  );

  const lastMessage = messages[messages.length - 1];
  const showTyping =
    status === "submitted" ||
    (status === "streaming" && lastMessage?.role === "assistant" && lastMessage.parts.length === 0);

  return (
    <div className={cn("flex min-h-0 flex-col bg-slate-50", className)}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-white">
              <IconSparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">BankSim Assistant</p>
              <p className="text-xs text-slate-500">Balances, statements, transfers, cards</p>
            </div>
          </div>
          {onNewConversation ? (
            <button type="button" onClick={onNewConversation} disabled={newConversationBusy} className={buttonStyles.ghost}>
              {newConversationBusy ? <Spinner className="h-4 w-4" /> : <IconPlus className="h-4 w-4" />}
              New
            </button>
          ) : null}
        </div>
      ) : null}

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-700">
              <IconSparkles className="h-6 w-6" />
            </span>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">How can I help with your banking?</h3>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
              I can check balances and statements, prepare transfers, deposits and withdrawals — money only moves after you tap Confirm.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submitText(s)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-navy-300 hover:text-navy-800"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageParts key={message.id} message={message} pendingToken={pendingToken} onResolve={handleResolve} />
          ))
        )}

        {showTyping ? (
          <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm w-fit">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:300ms]" />
          </div>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="mx-4 mb-2 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-800">The assistant is unavailable right now.</p>
            <p className="mt-0.5 text-xs leading-relaxed text-red-700">{friendlyError(error.message)}</p>
          </div>
          <button
            type="button"
            onClick={() => void regenerate()}
            className={cn(buttonStyles.secondary, "!px-3 !py-1.5 text-xs")}
          >
            Retry
          </button>
        </div>
      ) : null}

      <form
        className="border-t border-slate-200 bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submitText(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 transition focus-within:border-navy-400 focus-within:ring-2 focus-within:ring-navy-100">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onInput={(event) => {
              const node = event.currentTarget;
              node.style.height = "auto";
              node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitText(input);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Ask about balances, statements, transfers…"
            aria-label="Message the assistant"
            className="max-h-32 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-slate-400"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => stop()}
              aria-label="Stop generating"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
            >
              <IconX className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-white transition hover:bg-navy-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconSend className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-0.5 text-[11px] text-slate-400">
          Enter to send · Shift+Enter for a new line · money moves only after your Confirm tap
        </p>
      </form>
    </div>
  );
}
