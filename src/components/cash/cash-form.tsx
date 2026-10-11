"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cashTransactionAction } from "@/app/(app)/deposit-withdraw/actions";
import type { Account } from "@/lib/types";
import { MEMO_MAX_LENGTH, parseAmount } from "@/lib/constants";
import { formatINR, maskAccountNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ErrorAlert, Field, inputClass, labelClass } from "@/components/ui/form";
import { buttonStyles } from "@/components/ui/bits";
import { useToast } from "@/components/ui/toast";
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconCheckCircle,
  IconShield,
  Spinner,
} from "@/components/icons";

type Direction = "DEPOSIT" | "WITHDRAWAL";

export function CashForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [direction, setDirection] = useState<Direction>("DEPOSIT");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    reference: string;
    newBalance: number;
    amount: number;
    direction: Direction;
  } | null>(null);

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!account) {
      setError("Choose an account.");
      return;
    }
    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (account.status !== "ACTIVE") {
      setError(
        `This account is ${account.status} — money movement is blocked. Choose another account.`,
      );
      return;
    }

    startTransition(async () => {
      const res = await cashTransactionAction({
        accountId: account.id,
        direction,
        amount: String(parsed.value),
        memo,
      });

      if (!res.ok) {
        setError(res.error);
        toast({ variant: "error", title: "Transaction failed", description: res.error });
        return;
      }

      setResult({
        reference: res.reference,
        newBalance: res.newBalance,
        amount: parsed.value,
        direction,
      });
      toast({
        variant: "success",
        title: direction === "DEPOSIT" ? "Deposit successful" : "Withdrawal successful",
        description: `${formatINR(parsed.value)} · Ref ${res.reference}`,
      });
      setAmount("");
      setMemo("");
      router.refresh();
    });
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        No accounts found. Accounts are created during onboarding — sign out and
        back in, or register a new account.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {result ? (
        <div className="animate-rise-in rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <IconCheckCircle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-slate-900">
                {result.direction === "DEPOSIT" ? "Deposit" : "Withdrawal"} of{" "}
                {formatINR(result.amount)} complete
              </h2>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Reference</dt>
                  <dd className="font-mono text-xs font-semibold text-slate-800">
                    {result.reference}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">New balance</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {formatINR(result.newBalance)}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonStyles.secondary}
                  onClick={() => setResult(null)}
                >
                  New transaction
                </button>
                <Link href="/transactions" className={buttonStyles.ghost}>
                  View statement
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"
        noValidate
      >
        {error ? <ErrorAlert message={error} /> : null}

        <div>
          <span className={labelClass}>Transaction type</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("DEPOSIT")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition",
                direction === "DEPOSIT"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              <IconArrowDownLeft className="h-4 w-4" />
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setDirection("WITHDRAWAL")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition",
                direction === "WITHDRAWAL"
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              <IconArrowUpRight className="h-4 w-4" />
              Withdraw
            </button>
          </div>
        </div>

        <Field label="Account" htmlFor="account">
          <select
            id="account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={inputClass}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.type === "CHECKING" ? "Checking" : "Savings"}{" "}
                {maskAccountNumber(a.account_number)} — {formatINR(a.balance)}
                {a.status !== "ACTIVE" ? ` (${a.status.toLowerCase()})` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Amount"
          htmlFor="cashAmount"
          hint={
            direction === "DEPOSIT"
              ? "Deposits of ₹1.00 – ₹1,00,000.00 per transaction."
              : `Withdrawals of ₹1.00 – ₹1,00,000.00 · available ${account ? formatINR(account.balance) : "—"}.`
          }
        >
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-sm font-medium text-slate-400">
              ₹
            </span>
            <input
              id="cashAmount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`${inputClass} pl-9 text-lg font-semibold tabular-nums`}
            />
          </div>
        </Field>

        <Field
          label="Memo (optional)"
          htmlFor="cashMemo"
          hint={`${memo.length}/${MEMO_MAX_LENGTH} characters`}
        >
          <input
            id="cashMemo"
            type="text"
            value={memo}
            maxLength={MEMO_MAX_LENGTH}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={direction === "DEPOSIT" ? "e.g. ATM cash deposit" : "e.g. Rent withdrawal"}
            className={inputClass}
          />
        </Field>

        <div className="flex items-start gap-2.5 rounded-xl border border-navy-100 bg-navy-50/60 px-3.5 py-3 text-xs leading-relaxed text-navy-800">
          <IconShield className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Every movement is recorded as a ledger row with its own reference, and your
            balance can never go below zero.
          </span>
        </div>

        <button
          type="submit"
          disabled={pending}
          className={cn(buttonStyles.primary, "w-full")}
        >
          {pending ? <Spinner className="h-4 w-4" /> : null}
          {pending
            ? "Processing…"
            : direction === "DEPOSIT"
              ? "Deposit money"
              : "Withdraw money"}
        </button>
      </form>
    </div>
  );
}
