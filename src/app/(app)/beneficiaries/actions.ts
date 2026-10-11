"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_NUMBER_REGEX, IFSC_REGEX } from "@/lib/constants";

export type BeneficiaryResult = { ok: true } | { ok: false; error: string };

export async function addBeneficiaryAction(input: {
  name: string;
  accountNumber: string;
  ifsc: string;
  nickname: string;
}): Promise<BeneficiaryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const name = input.name.trim();
  const accountNumber = input.accountNumber.trim();
  const ifsc = input.ifsc.trim().toUpperCase();
  const nickname = input.nickname.trim();

  if (name.length < 2 || name.length > 60) {
    return { ok: false, error: "Enter the beneficiary's name (2–60 characters)." };
  }
  if (!ACCOUNT_NUMBER_REGEX.test(accountNumber)) {
    return { ok: false, error: "Enter a valid 11-digit account number." };
  }
  if (!IFSC_REGEX.test(ifsc)) {
    return { ok: false, error: "Enter a valid IFSC code (e.g. BSIM0000001)." };
  }
  if (nickname.length > 30) {
    return { ok: false, error: "Keep the nickname under 30 characters." };
  }

  const { error } = await supabase.from("beneficiaries").insert({
    user_id: user.id,
    name,
    account_number: accountNumber,
    ifsc,
    nickname: nickname || null,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "That account number is already saved in your beneficiaries.",
      };
    }
    return { ok: false, error: "Could not save the beneficiary. Please try again." };
  }

  revalidatePath("/beneficiaries");
  revalidatePath("/transfer");
  return { ok: true };
}

export async function deleteBeneficiaryAction(input: {
  id: string;
}): Promise<BeneficiaryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const { data, error } = await supabase
    .from("beneficiaries")
    .delete()
    .eq("id", input.id)
    .select("id");

  if (error) {
    return { ok: false, error: "Could not remove the beneficiary. Please try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Beneficiary not found." };
  }

  revalidatePath("/beneficiaries");
  revalidatePath("/transfer");
  return { ok: true };
}
