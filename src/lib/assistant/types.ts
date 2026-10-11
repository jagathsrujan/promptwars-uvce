// Shared types for the BankSim assistant (Phase 2 — tool-access layer).
//
// Every tool invocation flows through executeTool() in ./execute-tool.ts and
// returns one of these structured results. The UI renders them as cards; the
// model reads them as tool outputs. Phase 3's firewall will wrap the same
// chokepoint, so nothing else may call a tool implementation directly.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountStatus, AccountType, Database } from "@/lib/types";

export type AssistantToolName =
  | "list_accounts"
  | "get_transactions"
  | "list_beneficiaries"
  | "list_cards"
  | "transfer_money"
  | "deposit_cash"
  | "withdraw_cash"
  | "add_beneficiary"
  | "set_card_status";

export type MoneyToolName =
  | "transfer_money"
  | "deposit_cash"
  | "withdraw_cash"
  | "add_beneficiary"
  | "set_card_status";

/** Everything a tool is allowed to know about the caller. */
export interface ToolContext {
  /** Per-request Supabase client bound to the signed-in user's session (RLS). */
  supabase: SupabaseClient<Database>;
  userId: string;
  conversationId: string | null;
}

/* Results ------------------------------------------------------------------- */

export type ToolErrorCode =
  | "UNKNOWN_TOOL"
  | "INVALID_PARAMS"
  | "NOT_FOUND"
  | "INSUFFICIENT_FUNDS"
  | "ACCOUNT_BLOCKED"
  | "DUPLICATE"
  | "EXECUTION_FAILED";

export type ToolErrorResult = {
  status: "error";
  code: ToolErrorCode;
  message: string;
};

export type DetailLine = { label: string; value: string };

/** What the confirmation card shows before the user taps Confirm. */
export type ConfirmationRequest = {
  tool: AssistantToolName;
  title: string;
  details: DetailLine[];
  warning?: string;
};

export type ToolReceipt = {
  tool: AssistantToolName;
  title: string;
  amount: string | null;
  reference: string | null;
  details: DetailLine[];
  timestamp: string;
};

export type SuccessResult = {
  status: "success";
  receipt: ToolReceipt;
};

/** Set on the original confirmation card once the user has acted on it. */
export type ConfirmationResolution = {
  state: "confirmed" | "canceled" | "expired" | "failed";
  receipt?: ToolReceipt;
  error?: string;
};

export type ConfirmationRequiredResult = {
  status: "confirmation_required";
  confirmationToken: string;
  expiresAt: string;
  request: ConfirmationRequest;
  resolution?: ConfirmationResolution;
};

/* Read results ---------------------------------------------------------------- */

export type AccountSummary = {
  id: string;
  type: AccountType;
  type_label: string;
  masked_number: string;
  ifsc: string;
  balance: number;
  balance_formatted: string;
  status: AccountStatus;
};

export type ListAccountsResult = {
  status: "ok";
  total_balance: string;
  accounts: AccountSummary[];
};

export type TransactionLedgerRow = {
  reference: string;
  direction: "CREDIT" | "DEBIT";
  type: string;
  type_label: string;
  amount_formatted: string;
  balance_after_formatted: string;
  memo: string | null;
  date: string;
  created_at: string;
};

export type ListTransactionsResult = {
  status: "ok";
  account: { id: string; type: AccountType; type_label: string; masked_number: string };
  transactions: TransactionLedgerRow[];
  count: number;
  note: string;
};

export type BeneficiarySummary = {
  id: string;
  name: string;
  account_number: string;
  masked_number: string;
  ifsc: string;
  nickname: string | null;
};

export type ListBeneficiariesResult = {
  status: "ok";
  beneficiaries: BeneficiarySummary[];
};

export type CardSummary = {
  id: string;
  masked_number: string;
  network: string;
  holder_name: string;
  expiry: string;
  status: "ACTIVE" | "FROZEN";
  daily_limit_formatted: string;
  account: { id: string; type: AccountType; type_label: string; masked_number: string };
};

export type ListCardsResult = {
  status: "ok";
  cards: CardSummary[];
};

export type ToolResult =
  | ToolErrorResult
  | ConfirmationRequiredResult
  | SuccessResult
  | ListAccountsResult
  | ListTransactionsResult
  | ListBeneficiariesResult
  | ListCardsResult;
