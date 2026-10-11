import type { TxnType } from "@/lib/types";

export const IFSC_DEFAULT = "BSIM0000001";

export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 100_000;

export const ACCOUNT_NUMBER_REGEX = /^\d{11}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const AMOUNT_REGEX = /^\d{1,7}(\.\d{1,2})?$/;

export const STATEMENT_PAGE_SIZE = 10;
export const MEMO_MAX_LENGTH = 140;

export const DEMO_PASSWORD = "BankSim@123";
export const DEMO_USERS = [
  { name: "Aarav Sharma", email: "aarav@banksim.demo" },
  { name: "Priya Nair", email: "priya@banksim.demo" },
  { name: "Rahul Verma", email: "rahul@banksim.demo" },
] as const;

export const TXN_TYPE_LABELS: Record<TxnType, string> = {
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
};

export type ParsedAmount = { ok: true; value: number } | { ok: false; error: string };

/** Shared amount validation — the Postgres RPC re-checks everything server-side. */
export function parseAmount(input: string | number | null | undefined): ParsedAmount {
  if (input === null || input === undefined || String(input).trim() === "") {
    return { ok: false, error: "Enter an amount." };
  }
  const raw = String(input).trim();
  if (!AMOUNT_REGEX.test(raw)) {
    return { ok: false, error: "Enter a valid amount with up to 2 decimal places." };
  }
  const value = Number(raw);
  if (value < MIN_AMOUNT) {
    return { ok: false, error: "The minimum amount is ₹1.00." };
  }
  if (value > MAX_AMOUNT) {
    return { ok: false, error: "The maximum amount is ₹1,00,000.00 per transaction." };
  }
  return { ok: true, value };
}
