"use client";

// Rich renderers for tool results inside the chat. Every card reads the
// structured result that executeTool() returned (server-formatted: ₹ amounts,
// IST timestamps, masked numbers) — the model's prose never drives the numbers.

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge, buttonStyles } from "@/components/ui/bits";
import { IconAlert, IconCheckCircle, IconShield, Spinner } from "@/components/icons";
import type {
  ConfirmationRequiredResult,
  ListAccountsResult,
  ListBeneficiariesResult,
  ListCardsResult,
  ListTransactionsResult,
  SuccessResult,
  ToolResult,
} from "@/lib/assistant/types";

/** Loose shape of a persisted tool part (the parts are validated at execution). */
export type ToolPartLike = {
  type: string;
  state: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const BUSY_LABELS: Record<string, string> = {
  list_accounts: "Checking your accounts…",
  get_transactions: "Pulling up transactions…",
  list_beneficiaries: "Looking up your beneficiaries…",
  list_cards: "Checking your cards…",
  transfer_money: "Preparing the transfer…",
  deposit_cash: "Preparing the deposit…",
  withdraw_cash: "Preparing the withdrawal…",
  add_beneficiary: "Preparing the beneficiary…",
  set_card_status: "Preparing the card update…",
};

export function ToolPartCard({
  part,
  pendingToken,
  onResolve,
}: {
  part: ToolPartLike;
  pendingToken: string | null;
  onResolve: (token: string, action: "confirm" | "cancel") => void;
}) {
  const toolName = part.type.replace(/^tool-/, "");

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
        <Spinner className="h-3.5 w-3.5 text-navy-500" />
        {BUSY_LABELS[toolName] ?? "Working…"}
      </div>
    );
  }

  if (part.state === "output-error") {
    return <ErrorCard message={part.errorText ?? "That step couldn't be completed."} />;
  }

  if (part.state !== "output-available") {
    return null;
  }

  const output = part.output as ToolResult | undefined;
  if (!output || typeof output !== "object") return null;

  switch (output.status) {
    case "confirmation_required":
      return (
        <ConfirmationCard
          output={output}
          busy={pendingToken === output.confirmationToken}
          onResolve={onResolve}
        />
      );
    case "ok":
      return <ReadResultCard tool={toolName} output={output} />;
    case "success":
      return <ReceiptCard receipt={output.receipt} />;
    case "error":
      return <ErrorCard message={output.message} />;
    default:
      return null;
  }
}

/* Confirmation card ----------------------------------------------------------- */

function useCountdown(iso: string | undefined): number | null {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.floor((target - now) / 1000));
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ConfirmationCard({
  output,
  busy,
  onResolve,
}: {
  output: ConfirmationRequiredResult;
  busy: boolean;
  onResolve: (token: string, action: "confirm" | "cancel") => void;
}) {
  const secondsLeft = useCountdown(output.expiresAt);
  const resolution = output.resolution;
  const expired = !resolution && secondsLeft !== null && secondsLeft <= 0;
  const state: "pending" | "confirmed" | "canceled" | "expired" | "failed" =
    resolution?.state ?? (expired ? "expired" : "pending");

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-2xl border bg-white p-4 shadow-sm",
        state === "confirmed" ? "border-emerald-200" : "border-navy-200",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            state === "confirmed" ? "bg-emerald-50 text-emerald-600" : "bg-navy-50 text-navy-700",
          )}
        >
          {state === "confirmed" ? <IconCheckCircle className="h-4.5 w-4.5" /> : <IconShield className="h-4.5 w-4.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{output.request.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {state === "pending" ? "Waiting for your confirmation" : "Confirmation card"}
          </p>
        </div>
        {state === "confirmed" ? <Badge tone="emerald">Confirmed</Badge> : null}
        {state === "canceled" ? <Badge tone="slate">Cancelled</Badge> : null}
        {state === "expired" ? <Badge tone="amber">Expired</Badge> : null}
        {state === "failed" ? <Badge tone="red">Failed</Badge> : null}
      </div>

      <dl className="mt-3 space-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5">
        {output.request.details.map((d) => (
          <div key={`${d.label}-${d.value}`} className="flex items-baseline justify-between gap-4 text-sm">
            <dt className="shrink-0 text-slate-500">{d.label}</dt>
            <dd className="text-right font-medium text-slate-900">{d.value}</dd>
          </div>
        ))}
      </dl>

      {state === "pending" ? (
        <>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onResolve(output.confirmationToken, "confirm")}
              disabled={busy}
              className={cn(buttonStyles.primary, "flex-1")}
            >
              {busy ? <Spinner className="h-4 w-4" /> : <IconCheckCircle className="h-4 w-4" />}
              {busy ? "Working…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => onResolve(output.confirmationToken, "cancel")}
              disabled={busy}
              className={cn(buttonStyles.secondary, "flex-1")}
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            {secondsLeft !== null ? `Expires in ${formatCountdown(secondsLeft)} · ` : ""}
            Only your tap executes this — chat replies can't.
          </p>
        </>
      ) : null}

      {state === "expired" ? (
        <p className="mt-3 text-xs leading-relaxed text-amber-700">
          This request expired and nothing was executed. Ask the assistant to prepare it again.
        </p>
      ) : null}
      {state === "canceled" ? (
        <p className="mt-3 text-xs text-slate-500">Cancelled — nothing was executed.</p>
      ) : null}
      {state === "failed" ? (
        <p className="mt-3 text-xs leading-relaxed text-red-700">
          {resolution?.error ?? "This action couldn't be completed."}
        </p>
      ) : null}
      {state === "confirmed" ? (
        <p className="mt-3 text-xs text-emerald-700">Executed after your confirmation.</p>
      ) : null}
    </div>
  );
}

/* Receipt card ---------------------------------------------------------------- */

function ReceiptCard({ receipt }: { receipt: SuccessResult["receipt"] }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-center gap-2 text-emerald-700">
        <IconCheckCircle className="h-4.5 w-4.5" />
        <p className="text-sm font-semibold">{receipt.title}</p>
      </div>
      {receipt.amount ? (
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{receipt.amount}</p>
      ) : null}
      <dl className="mt-3 space-y-1.5">
        {receipt.details.map((d) => (
          <div key={`${d.label}-${d.value}`} className="flex items-baseline justify-between gap-4 text-sm">
            <dt className="shrink-0 text-slate-500">{d.label}</dt>
            <dd className="text-right font-medium tabular-nums text-slate-900">{d.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-emerald-200/70 pt-2.5">
        {receipt.reference ? (
          <span className="rounded-md bg-white px-2 py-1 font-mono text-[11px] text-slate-500">
            Ref {receipt.reference}
          </span>
        ) : (
          <span />
        )}
        <span className="text-[11px] text-slate-400">{receipt.timestamp} IST</span>
      </div>
    </div>
  );
}

/* Error card ------------------------------------------------------------------ */

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="flex w-full max-w-md items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p className="text-sm leading-relaxed text-amber-900">{message}</p>
    </div>
  );
}

/* Read-result cards ------------------------------------------------------------ */

function ReadResultCard({ tool, output }: { tool: string; output: Exclude<ToolResult, { status: "error" | "confirmation_required" | "success" }> }) {
  switch (tool) {
    case "list_accounts":
      return <AccountsCard output={output as ListAccountsResult} />;
    case "get_transactions":
      return <TransactionsCard output={output as ListTransactionsResult} />;
    case "list_beneficiaries":
      return <BeneficiariesCard output={output as ListBeneficiariesResult} />;
    case "list_cards":
      return <CardsCard output={output as ListCardsResult} />;
    default:
      return null;
  }
}

function CardShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {title ? <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p> : null}
      {children}
    </div>
  );
}

function AccountsCard({ output }: { output: ListAccountsResult }) {
  return (
    <CardShell title="Your accounts">
      <div className="space-y-2">
        {output.accounts.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{a.type_label}</p>
              <p className="mt-0.5 font-mono text-xs text-slate-400">
                {a.masked_number} · IFSC {a.ifsc}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-base font-semibold tabular-nums text-slate-900">{a.balance_formatted}</p>
              {a.status !== "ACTIVE" ? (
                <Badge tone={a.status === "FROZEN" ? "amber" : "red"} className="mt-1">
                  {a.status === "FROZEN" ? "Frozen" : "Closed"}
                </Badge>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-sm">
        <span className="text-slate-500">Total balance</span>
        <span className="font-semibold tabular-nums text-slate-900">{output.total_balance}</span>
      </div>
    </CardShell>
  );
}

function TransactionsCard({ output }: { output: ListTransactionsResult }) {
  if (output.transactions.length === 0) {
    return (
      <CardShell title={`${output.account.type_label} ${output.account.masked_number}`}>
        <p className="text-sm text-slate-500">{output.note}</p>
      </CardShell>
    );
  }
  return (
    <CardShell title={`${output.account.type_label} ${output.account.masked_number} · ${output.count} entries`}>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {output.transactions.map((t) => (
          <div key={`${t.reference}-${t.created_at}`} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{t.memo || t.type_label}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {t.date} · {t.type_label}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  t.direction === "CREDIT" ? "text-emerald-600" : "text-red-600",
                )}
              >
                {t.direction === "CREDIT" ? "+" : "−"}
                {t.amount_formatted}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-slate-400">Bal {t.balance_after_formatted}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-slate-400">{output.note}</p>
    </CardShell>
  );
}

function BeneficiariesCard({ output }: { output: ListBeneficiariesResult }) {
  if (output.beneficiaries.length === 0) {
    return (
      <CardShell title="Beneficiaries">
        <p className="text-sm text-slate-500">No beneficiaries saved yet — you can add one by asking the assistant.</p>
      </CardShell>
    );
  }
  return (
    <CardShell title="Beneficiaries">
      <div className="space-y-2">
        {output.beneficiaries.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{b.name}</p>
              <p className="mt-0.5 font-mono text-xs text-slate-400">
                {b.masked_number} · {b.ifsc}
              </p>
            </div>
            {b.nickname ? <Badge tone="navy">{b.nickname}</Badge> : null}
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function CardsCard({ output }: { output: ListCardsResult }) {
  if (output.cards.length === 0) {
    return (
      <CardShell title="Your cards">
        <p className="text-sm text-slate-500">No cards on your accounts yet.</p>
      </CardShell>
    );
  }
  return (
    <CardShell title="Your cards">
      <div className="space-y-2">
        {output.cards.map((c) => (
          <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-sm text-slate-800">{c.masked_number}</p>
              <Badge tone={c.status === "ACTIVE" ? "emerald" : "amber"}>
                {c.status === "ACTIVE" ? "Active" : "Frozen"}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{c.network}</span>
              <span>Expires {c.expiry}</span>
              <span>Daily limit {c.daily_limit_formatted}</span>
              <span className="text-slate-400">
                {c.account.type_label} {c.account.masked_number}
              </span>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}
