"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MEMO_MAX_LENGTH, parseAmount } from "@/lib/constants";

export type CashResult =
  | { ok: true; reference: string; newBalance: number }
  | { ok: false; error: string };

function friendlyRpcError(message: string): string {
  if (/deadlock/i.test(message)) {
    return "Another operation was in progress. Please try again.";
  }
  const cleaned = message.replace(/^.*?error:\s*/i, "").trim();
  return cleaned || "Something went wrong. Please try again.";
}

export async function cashTransactionAction(input: {
  accountId: string;
  direction: "DEPOSIT" | "WITHDRAWAL";
  amount: string;
  memo: string;
}): Promise<CashResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  if (!input.accountId) {
    return { ok: false, error: "Choose an account." };
  }
  if (input.direction !== "DEPOSIT" && input.direction !== "WITHDRAWAL") {
    return { ok: false, error: "Choose deposit or withdrawal." };
  }
  const parsed = parseAmount(input.amount);
  if (!parsed.ok) {
    return parsed;
  }

  const { data: reference, error } = await supabase.rpc("cash_transaction", {
    account_id: input.accountId,
    direction: input.direction,
    amount: parsed.value,
    memo: input.memo.trim().slice(0, MEMO_MAX_LENGTH) || null,
  });

  if (error) {
    return { ok: false, error: friendlyRpcError(error.message) };
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("balance")
    .eq("id", input.accountId)
    .maybeSingle();

  revalidatePath("/", "layout");

  return {
    ok: true,
    reference: reference ?? "",
    newBalance: Number(account?.balance ?? 0),
  };
}
