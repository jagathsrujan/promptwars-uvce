"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ACCOUNT_NUMBER_REGEX,
  IFSC_REGEX,
  MEMO_MAX_LENGTH,
  parseAmount,
} from "@/lib/constants";

export type TransferResult =
  | { ok: true; reference: string; newBalance: number }
  | { ok: false; error: string };

function friendlyRpcError(message: string): string {
  if (/deadlock/i.test(message)) {
    return "Another operation was in progress. Please try again.";
  }
  const cleaned = message.replace(/^.*?error:\s*/i, "").trim();
  return cleaned || "Something went wrong. Please try again.";
}

export async function performTransferAction(input: {
  fromAccountId: string;
  toAccountNumber: string;
  amount: string;
  memo: string;
  saveBeneficiary?: { name: string; ifsc: string; nickname?: string } | null;
}): Promise<TransferResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  // Server-side validation (client validates too; the database is the authority).
  const parsed = parseAmount(input.amount);
  if (!parsed.ok) {
    return parsed;
  }
  if (!input.fromAccountId) {
    return { ok: false, error: "Choose an account to transfer from." };
  }
  const toAccountNumber = input.toAccountNumber.trim();
  if (!ACCOUNT_NUMBER_REGEX.test(toAccountNumber)) {
    return { ok: false, error: "Enter a valid 11-digit account number." };
  }
  const memo = input.memo.trim().slice(0, MEMO_MAX_LENGTH);
  if (input.saveBeneficiary) {
    const name = input.saveBeneficiary.name.trim();
    const ifsc = input.saveBeneficiary.ifsc.trim().toUpperCase();
    if (name.length < 2 || name.length > 60) {
      return { ok: false, error: "Enter the beneficiary's name (2–60 characters)." };
    }
    if (!IFSC_REGEX.test(ifsc)) {
      return { ok: false, error: "Enter a valid IFSC code (e.g. BSIM0000001)." };
    }
  }

  const { data: reference, error } = await supabase.rpc("perform_transfer", {
    from_account_id: input.fromAccountId,
    to_account_number: toAccountNumber,
    amount: parsed.value,
    memo: memo || null,
  });

  if (error) {
    return { ok: false, error: friendlyRpcError(error.message) };
  }

  // The transfer is committed. Saving the beneficiary is best-effort.
  if (input.saveBeneficiary) {
    await supabase.from("beneficiaries").insert({
      user_id: user.id,
      name: input.saveBeneficiary.name.trim().slice(0, 60),
      account_number: toAccountNumber,
      ifsc: input.saveBeneficiary.ifsc.trim().toUpperCase(),
      nickname: input.saveBeneficiary.nickname?.trim().slice(0, 30) || null,
    });
    // A duplicate simply means it was already saved — nothing to do.
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("balance")
    .eq("id", input.fromAccountId)
    .maybeSingle();

  revalidatePath("/", "layout");

  return {
    ok: true,
    reference: reference ?? "",
    newBalance: Number(account?.balance ?? 0),
  };
}
