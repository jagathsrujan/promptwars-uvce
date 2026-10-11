"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { performTransferAction } from "@/app/(app)/transfer/actions";
import type { Account, Beneficiary } from "@/lib/types";
import {
  ACCOUNT_NUMBER_REGEX,
  IFSC_DEFAULT,
  IFSC_REGEX,
  MEMO_MAX_LENGTH,
  parseAmount,
} from "@/lib/constants";
import { formatINR, maskAccountNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ErrorAlert, Field, inputClass, labelClass } from "@/components/ui/form";
import { buttonStyles } from "@/components/ui/bits";
import { useToast } from "@/components/ui/toast";
import {
  IconCheckCircle,
  IconChevronLeft,
  IconShield,
} from "@/components/icons";
import { Spinner } from "@/components/icons";

type Step = "details" | "review" | "success";

const accountLabel = (account: Account) =>
  `${account.type === "CHECKING" ? "Checking" : "Savings"} ${maskAccountNumber(account.account_number)} — ${formatINR(account.balance)}${account.status !== "ACTIVE" ? ` (${account.status.toLowerCase()})` : ""}`;

export function TransferForm({
  accounts,
  beneficiaries,
}: {
  accounts: Account[];
  beneficiaries: Beneficiary[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("details");
  const [error, setError] = useState<string | null>(null);

  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [mode, setMode] = useState<"beneficiary" | "new">(
    beneficiaries.length > 0 ? "beneficiary" : "new",
  );
  const [beneficiaryId, setBeneficiaryId] = useState(beneficiaries[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newAccount, setNewAccount] = useState("");
  const [newIfsc, setNewIfsc] = useState(IFSC_DEFAULT);
  const [saveNew, setSaveNew] = useState(true);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const [amountValue, setAmountValue] = useState<number | null>(null);
  const [result, setResult] = useState<{ reference: string; newBalance: number } | null>(null);

  const fromAccount = useMemo(() => accounts.find((a) => a.id === fromId) ?? null, [accounts, fromId]);
  const beneficiary = useMemo(
    () => beneficiaries.find((b) => b.id === beneficiaryId) ?? null,
    [beneficiaries, beneficiaryId],
  );

  const reviewTo = useMemo(() => {
    if (mode === "beneficiary" && beneficiary) {
      return { name: beneficiary.name, accountNumber: beneficiary.account_number, ifsc: beneficiary.ifsc };
    }
    return { name: newName.trim(), accountNumber: newAccount.trim(), ifsc: newIfsc.trim().toUpperCase() };
  }, [mode, beneficiary, newName, newAccount, newIfsc]);

  function validateAndReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!fromAccount) {
      setError("Choose an account to transfer from.");
      return;
    }
    if (mode === "beneficiary") {
      if (!beneficiary) {
        setError("Choose a beneficiary, or switch to “New account”.");
        return;
      }
    } else {
      if (newName.trim().length < 2) {
        setError("Enter the recipient's name (at least 2 characters).");
        return;
      }
      if (!ACCOUNT_NUMBER_REGEX.test(newAccount.trim())) {
        setError("Enter a valid 11-digit account number.");
        return;
      }
      if (!IFSC_REGEX.test(newIfsc.trim().toUpperCase())) {
        setError("Enter a valid IFSC code (e.g. BSIM0000001).");
        return;
      }
    }
    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (fromAccount.status !== "ACTIVE") {
      setError(
        `This account is ${fromAccount.status} — money movement is blocked. Choose another account.`,
      );
      return;
    }
    setAmountValue(parsed.value);
    setStep("review");
  }

  function confirmTransfer() {
    if (amountValue === null || !fromAccount) return;
    setError(null);
    startTransition(async () => {
      const res = await performTransferAction({
        fromAccountId: fromAccount.id,
        toAccountNumber: reviewTo.accountNumber,
        amount: String(amountValue),
        memo,
        saveBeneficiary:
          mode === "new" && saveNew
            ? { name: newName.trim(), ifsc: newIfsc.trim().toUpperCase() }
            : null,
      });

      if (!res.ok) {
        setError(res.error);
        toast({ variant: "error", title: "Transfer failed", description: res.error });
        return;
      }

      setResult({ reference: res.reference, newBalance: res.newBalance });
      setStep("success");
      toast({
        variant: "success",
        title: "Transfer successful",
        description: `${formatINR(amountValue)} sent · Ref ${res.reference}`,
      });
      router.refresh();
    });
  }

  function resetForAnother() {
    setStep("details");
    setError(null);
    setResult(null);
    setAmount("");
    setAmountValue(null);
    setMemo("");
    setNewName("");
    setNewAccount("");
    setNewIfsc(IFSC_DEFAULT);
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        You don't have an account to transfer from yet. Accounts are created during
        onboarding — try signing out and back in, or create a new account.
      </div>
    );
  }

  if (step === "success" && result) {
    return (
      <div className="animate-rise-in rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <IconCheckCircle className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">
          {formatINR(amountValue ?? 0)} sent to {reviewTo.name}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          The money is in their account now — both ledgers were updated atomically.
        </p>
        <dl className="mx-auto mt-6 max-w-sm space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Reference</dt>
            <dd className="font-mono text-xs font-semibold text-slate-800">{result.reference}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">To</dt>
            <dd className="font-medium text-slate-800">
              {reviewTo.name} · {maskAccountNumber(reviewTo.accountNumber)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">New balance</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{formatINR(result.newBalance)}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={resetForAnother} className={buttonStyles.primary}>
            Make another transfer
          </button>
          <Link href="/transactions" className={buttonStyles.secondary}>
            View statement
          </Link>
          <Link href="/dashboard" className={buttonStyles.ghost}>
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="animate-rise-in rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <h2 className="text-lg font-semibold text-slate-900">Review your transfer</h2>
        <p className="mt-1 text-sm text-slate-500">
          Check the details carefully — transfers are immediate and cannot be reversed.
        </p>

        {error ? <ErrorAlert message={error} className="mt-4" /> : null}

        <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-slate-500">From</dt>
            <dd className="text-right text-sm font-medium text-slate-900">
              {fromAccount ? accountLabel(fromAccount) : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-slate-500">To</dt>
            <dd className="text-right text-sm font-medium text-slate-900">
              {reviewTo.name}
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                {maskAccountNumber(reviewTo.accountNumber)} · IFSC {reviewTo.ifsc}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-slate-500">Amount</dt>
            <dd className="text-right text-lg font-semibold tabular-nums text-slate-900">
              {formatINR(amountValue ?? 0)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-slate-500">Memo</dt>
            <dd className="text-right text-sm text-slate-700">{memo.trim() || "—"}</dd>
          </div>
        </dl>

        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-navy-100 bg-navy-50/60 px-3.5 py-3 text-xs leading-relaxed text-navy-800">
          <IconShield className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            BankSim moves money through an atomic database transaction: sender and
            receiver ledgers update together, or not at all.
          </span>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep("details")}
            disabled={pending}
            className={buttonStyles.secondary}
          >
            <IconChevronLeft className="h-4 w-4" />
            Back
          </button>
          <button
            type="button"
            onClick={confirmTransfer}
            disabled={pending}
            className={cn(buttonStyles.primary, "min-w-40")}
          >
            {pending ? <Spinner className="h-4 w-4" /> : null}
            {pending ? "Sending…" : `Send ${formatINR(amountValue ?? 0)}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={validateAndReview} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7" noValidate>
      {error ? <ErrorAlert message={error} /> : null}

      <Field label="From account" htmlFor="fromAccount">
        <select
          id="fromAccount"
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          className={inputClass}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {accountLabel(account)}
            </option>
          ))}
        </select>
      </Field>

      {fromAccount && fromAccount.status !== "ACTIVE" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
          Heads up: this account is {fromAccount.status}. The server will reject any
          movement from it — pick an active account, or ask support to reactivate it.
        </div>
      ) : null}

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className={labelClass}>To</span>
          {beneficiaries.length > 0 ? (
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setMode("beneficiary")}
                className={cn(
                  "rounded-md px-2.5 py-1 transition",
                  mode === "beneficiary" ? "bg-white text-navy-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                Saved beneficiary
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className={cn(
                  "rounded-md px-2.5 py-1 transition",
                  mode === "new" ? "bg-white text-navy-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                New account
              </button>
            </div>
          ) : null}
        </div>

        {mode === "beneficiary" ? (
          <select
            id="beneficiary"
            value={beneficiaryId}
            onChange={(e) => setBeneficiaryId(e.target.value)}
            className={inputClass}
          >
            {beneficiaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {maskAccountNumber(b.account_number)}
                {b.nickname ? ` · ${b.nickname}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-3">
            <input
              aria-label="Recipient name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Recipient name"
              className={inputClass}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                aria-label="Account number"
                type="text"
                inputMode="numeric"
                value={newAccount}
                onChange={(e) => setNewAccount(e.target.value.replace(/[^0-9]/g, "").slice(0, 11))}
                placeholder="11-digit account number"
                className={`${inputClass} font-mono tracking-wider`}
              />
              <input
                aria-label="IFSC"
                type="text"
                value={newIfsc}
                onChange={(e) => setNewIfsc(e.target.value.toUpperCase().slice(0, 11))}
                placeholder="IFSC"
                className={`${inputClass} font-mono tracking-wider`}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={saveNew}
                onChange={(e) => setSaveNew(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-navy-800 accent-navy-800"
              />
              Save this recipient to my beneficiaries
            </label>
          </div>
        )}
      </div>

      <Field
        label="Amount"
        htmlFor="amount"
        hint="Between ₹1.00 and ₹1,00,000.00 per transaction · up to 2 decimal places."
      >
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-sm font-medium text-slate-400">
            ₹
          </span>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={`${inputClass} pl-9 text-lg font-semibold tabular-nums`}
          />
        </div>
      </Field>

      <Field label="Memo (optional)" htmlFor="memo" hint={`${memo.length}/${MEMO_MAX_LENGTH} characters`}>
        <input
          id="memo"
          type="text"
          value={memo}
          maxLength={MEMO_MAX_LENGTH}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="e.g. Rent — October"
          className={inputClass}
        />
      </Field>

      <button type="submit" className={cn(buttonStyles.primary, "w-full")}>
        Continue to review
      </button>
    </form>
  );
}
