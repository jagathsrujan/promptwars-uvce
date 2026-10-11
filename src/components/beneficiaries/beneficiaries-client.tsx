"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  addBeneficiaryAction,
  deleteBeneficiaryAction,
} from "@/app/(app)/beneficiaries/actions";
import type { Beneficiary } from "@/lib/types";
import { IFSC_DEFAULT } from "@/lib/constants";
import { formatISTDate, maskAccountNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ErrorAlert, Field, inputClass } from "@/components/ui/form";
import { EmptyState, buttonStyles } from "@/components/ui/bits";
import { useToast } from "@/components/ui/toast";
import {
  IconPlus,
  IconUsers,
  IconX,
  Spinner,
} from "@/components/icons";

export function BeneficiariesClient({ beneficiaries }: { beneficiaries: Beneficiary[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(beneficiaries.length === 0);
  const [name, setName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState(IFSC_DEFAULT);
  const [nickname, setNickname] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [addPending, startAdd] = useTransition();

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    startAdd(async () => {
      const res = await addBeneficiaryAction({ name, accountNumber, ifsc, nickname });
      if (!res.ok) {
        setFormError(res.error);
        toast({ variant: "error", title: "Could not add beneficiary", description: res.error });
        return;
      }
      toast({
        variant: "success",
        title: "Beneficiary added",
        description: `${name.trim()} is now available in your transfer screen.`,
      });
      setName("");
      setAccountNumber("");
      setIfsc(IFSC_DEFAULT);
      setNickname("");
      setShowForm(false);
      router.refresh();
    });
  }

  function handleDelete(id: string, beneficiaryName: string) {
    startDelete(async () => {
      const res = await deleteBeneficiaryAction({ id });
      if (!res.ok) {
        toast({ variant: "error", title: "Could not remove beneficiary", description: res.error });
        return;
      }
      toast({ variant: "success", title: "Beneficiary removed", description: `${beneficiaryName} was removed from your list.` });
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          {beneficiaries.length === 0
            ? "No saved beneficiaries yet."
            : `${beneficiaries.length} saved beneficiar${beneficiaries.length === 1 ? "y" : "ies"}.`}
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          aria-expanded={showForm}
          aria-controls="new-beneficiary-form"
          className={showForm ? buttonStyles.secondary : buttonStyles.primary}
        >
          {showForm ? <IconX className="h-4 w-4" /> : <IconPlus className="h-4 w-4" />}
          {showForm ? "Close" : "Add beneficiary"}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={handleAdd}
          id="new-beneficiary-form"
          aria-label="New beneficiary"
          className="animate-rise-in space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          noValidate
        >
          <h2 className="text-base font-semibold text-slate-900">New beneficiary</h2>
          {formError ? <ErrorAlert message={formError} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="benName">
              <input
                id="benName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rahul Verma"
                className={inputClass}
              />
            </Field>
            <Field label="Nickname (optional)" htmlFor="benNickname">
              <input
                id="benNickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Landlord"
                className={inputClass}
              />
            </Field>
            <Field label="Account number" htmlFor="benAccount" hint="11 digits.">
              <input
                id="benAccount"
                type="text"
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) =>
                  setAccountNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 11))
                }
                placeholder="50300006104"
                className={`${inputClass} font-mono tracking-wider`}
              />
            </Field>
            <Field label="IFSC" htmlFor="benIfsc">
              <input
                id="benIfsc"
                type="text"
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase().slice(0, 11))}
                placeholder="BSIM0000001"
                className={`${inputClass} font-mono tracking-wider`}
              />
            </Field>
          </div>

          <button type="submit" disabled={addPending} className={cn(buttonStyles.primary, "w-full sm:w-auto")}>
            {addPending ? <Spinner className="h-4 w-4" /> : <IconPlus className="h-4 w-4" />}
            {addPending ? "Saving…" : "Save beneficiary"}
          </button>
        </form>
      ) : null}

      {beneficiaries.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-5 w-5" />}
          title="No beneficiaries yet"
          description="Save the people you pay often — rent, split bills, friends. They'll appear in one tap on the transfer screen."
          action={
            <button type="button" onClick={() => setShowForm(true)} className={buttonStyles.primary}>
              <IconPlus className="h-4 w-4" />
              Add your first beneficiary
            </button>
          }
        />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {beneficiaries.map((b) => {
            const initials = b.name
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p.charAt(0).toUpperCase())
              .join("");
            const confirming = confirmId === b.id;
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy-800">
                  {initials || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                    {b.name}
                    {b.nickname ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {b.nickname}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    <span className="font-mono tracking-wider">{maskAccountNumber(b.account_number)}</span>
                    {" · "}IFSC {b.ifsc}
                    {" · "}Added {formatISTDate(b.created_at)}
                  </p>
                </div>

                {confirming ? (
                  <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                    <span className="text-xs text-slate-500">Remove {b.name}?</span>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      disabled={deletePending}
                      className={buttonStyles.ghost}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(b.id, b.name)}
                      disabled={deletePending}
                      className={buttonStyles.danger}
                    >
                      {deletePending ? <Spinner className="h-4 w-4" /> : null}
                      {deletePending ? "Removing…" : "Remove"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(b.id)}
                    className={buttonStyles.ghost}
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
