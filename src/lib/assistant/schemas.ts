// Tool schemas for the BankSim assistant.
//
// Two layers on purpose:
//   * `inputSchema` (loose) is what the AI SDK exposes to the model — it accepts
//     slightly sloppy shapes (string amounts, missing totals) so a model mistake
//     surfaces as a readable tool error instead of a masked stream error.
//   * the strict schemas are the validation authority inside executeTool(); the
//     model can never widen them, and the Postgres RPCs re-check everything
//     again at the database boundary.

import { z } from "zod";
import { IFSC_REGEX } from "@/lib/constants";
import type { AssistantToolName, MoneyToolName } from "./types";

export const MONEY_TOOL_NAMES: MoneyToolName[] = [
  "transfer_money",
  "deposit_cash",
  "withdraw_cash",
  "add_beneficiary",
  "set_card_status",
];

export function isMoneyTool(name: string): name is MoneyToolName {
  return (MONEY_TOOL_NAMES as string[]).includes(name);
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const amountLoose = z
  .coerce.number()
  .describe("Amount in Indian Rupees, between 1 and 100000, at most 2 decimal places");

const memoLoose = z
  .string()
  .max(140)
  .optional()
  .describe("Short note stored with the transaction (max 140 characters)");

/* Loose, model-facing schemas ------------------------------------------------ */

export const SDK_SCHEMAS: Record<AssistantToolName, z.ZodTypeAny> = {
  list_accounts: z.object({}),
  get_transactions: z.object({
    account_id: z.string().describe("Account UUID from list_accounts"),
    type: z
      .enum(["TRANSFER_IN", "TRANSFER_OUT", "DEPOSIT", "WITHDRAWAL"])
      .optional()
      .describe("Filter by ledger entry type"),
    direction: z.enum(["CREDIT", "DEBIT"]).optional().describe("Filter by money direction"),
    date_from: z.string().optional().describe("Start date, YYYY-MM-DD (IST), inclusive"),
    date_to: z.string().optional().describe("End date, YYYY-MM-DD (IST), inclusive"),
    search: z.string().optional().describe("Text to search inside memo and reference"),
    limit: z.coerce.number().optional().describe("Maximum rows to return (default 10, max 25)"),
  }),
  list_beneficiaries: z.object({}),
  list_cards: z.object({}),
  transfer_money: z.object({
    from_account_id: z.string().describe("Account UUID to send from (from list_accounts)"),
    to_account_number: z.string().describe("Recipient's 11-digit BankSim account number"),
    amount: amountLoose,
    memo: memoLoose,
  }),
  deposit_cash: z.object({
    account_id: z.string().describe("Account UUID to deposit into (from list_accounts)"),
    amount: amountLoose,
    memo: memoLoose,
  }),
  withdraw_cash: z.object({
    account_id: z.string().describe("Account UUID to withdraw from (from list_accounts)"),
    amount: amountLoose,
    memo: memoLoose,
  }),
  add_beneficiary: z.object({
    name: z.string().describe("Beneficiary's full name (2-60 characters)"),
    account_number: z.string().describe("Beneficiary's 11-digit BankSim account number"),
    ifsc: z.string().describe("IFSC code, e.g. BSIM0000001"),
    nickname: z.string().optional().describe("Optional short nickname (max 30 characters)"),
  }),
  set_card_status: z.object({
    card_id: z.string().describe("Card UUID from list_cards"),
    frozen: z.coerce.boolean().describe("true to freeze the card, false to unfreeze it"),
  }),
};

export const TOOL_DESCRIPTIONS: Record<AssistantToolName, string> = {
  list_accounts:
    "List the customer's own accounts (checking/savings) with balances, masked numbers, IFSC and status. Use this for any balance question and to resolve which account to act on.",
  get_transactions:
    "Fetch ledger entries for one of the customer's accounts, newest first, with optional filters (type, direction, date range in IST, memo/reference search) and a limit.",
  list_beneficiaries:
    "List the customer's saved beneficiaries with their full account numbers — use this to resolve a person's name (e.g. 'Rahul') to an account number before proposing a transfer.",
  list_cards:
    "List the customer's cards: masked number, network, holder, expiry, status and daily limit, plus the account each card belongs to.",
  transfer_money:
    "Propose sending money from one of the customer's accounts to an 11-digit BankSim account number. The customer must confirm the proposal in the UI before it executes.",
  deposit_cash:
    "Propose depositing cash into one of the customer's accounts. Requires the customer's confirmation in the UI before it executes.",
  withdraw_cash:
    "Propose withdrawing cash from one of the customer's accounts. Requires the customer's confirmation in the UI before it executes.",
  add_beneficiary:
    "Propose saving a new beneficiary (name + 11-digit account number + IFSC + optional nickname). Requires the customer's confirmation in the UI before it is saved.",
  set_card_status:
    "Propose freezing or unfreezing one of the customer's cards. Requires the customer's confirmation in the UI before it executes.",
};

/* Strict schemas — the validation authority inside executeTool --------------- */

const uuid = (label: string) =>
  z.string().regex(UUID_RE, `The ${label} must be a valid id — call the matching read tool first.`);

// numeric(14,2)-safe: at most 2 decimal places (tolerant of float noise).
const amountStrict = z
  .number()
  .finite()
  .min(1, "The minimum amount is ₹1.00.")
  .max(100_000, "The maximum amount per transaction is ₹1,00,000.00.")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: "Amounts can have at most 2 decimal places.",
  });

const memoStrict = z.string().max(140, "Memos can be at most 140 characters.").optional();

const accountNumberStrict = z
  .string()
  .trim()
  .regex(/^\d{11}$/, "Account numbers are 11 digits.");

const dateStrict = z
  .string()
  .regex(DATE_RE, "Dates must be YYYY-MM-DD.")
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00+05:30`).getTime()), {
    message: "That date is not a real calendar date.",
  });

export const strictSchemas = {
  list_accounts: z.object({}),
  get_transactions: z.object({
    account_id: uuid("account id"),
    type: z.enum(["TRANSFER_IN", "TRANSFER_OUT", "DEPOSIT", "WITHDRAWAL"]).optional(),
    direction: z.enum(["CREDIT", "DEBIT"]).optional(),
    date_from: dateStrict.optional(),
    date_to: dateStrict.optional(),
    search: z.string().trim().max(60, "Search text is too long.").optional(),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  list_beneficiaries: z.object({}),
  list_cards: z.object({}),
  transfer_money: z.object({
    from_account_id: uuid("account id"),
    to_account_number: accountNumberStrict,
    amount: amountStrict,
    memo: memoStrict,
  }),
  deposit_cash: z.object({
    account_id: uuid("account id"),
    amount: amountStrict,
    memo: memoStrict,
  }),
  withdraw_cash: z.object({
    account_id: uuid("account id"),
    amount: amountStrict,
    memo: memoStrict,
  }),
  add_beneficiary: z.object({
    name: z
      .string()
      .trim()
      .min(2, "The beneficiary's name should be 2-60 characters.")
      .max(60, "The beneficiary's name should be 2-60 characters."),
    account_number: accountNumberStrict,
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(IFSC_REGEX, "That IFSC code doesn't look valid (e.g. BSIM0000001)."),
    nickname: z.string().trim().max(30, "Nicknames can be at most 30 characters.").optional(),
  }),
  set_card_status: z.object({
    card_id: uuid("card id"),
    frozen: z.boolean(),
  }),
} as const;
