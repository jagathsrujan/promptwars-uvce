// Tool implementations — the only place the assistant touches the database.
//
// Every function receives the caller's own RLS-scoped Supabase client (created
// from the signed-in session) and never a service-role client, so the assistant
// can only ever read or move the signed-in user's data. Money movement reuses
// the Phase 1 SECURITY DEFINER RPCs (perform_transfer / cash_transaction) —
// there are no new balance writes anywhere in this file.

import { formatExpiry, formatINR, formatIST, maskAccountNumber, sumINR } from "@/lib/format";
import type { Account, AccountType, TxnType } from "@/lib/types";
import type {
  BeneficiarySummary,
  CardSummary,
  ConfirmationRequest,
  ListAccountsResult,
  ListBeneficiariesResult,
  ListCardsResult,
  ListTransactionsResult,
  SuccessResult,
  ToolContext,
  ToolErrorCode,
  ToolErrorResult,
  ToolReceipt,
  TransactionLedgerRow,
} from "./types";

const ACCOUNT_LABELS: Record<AccountType, string> = {
  CHECKING: "Checking account",
  SAVINGS: "Savings account",
};

const TXN_LABELS: Record<TxnType, string> = {
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
};

export function toolError(code: ToolErrorCode, message: string): ToolErrorResult {
  return { status: "error", code, message };
}

function unexpectedError(): ToolErrorResult {
  return toolError("EXECUTION_FAILED", "Something went wrong on our side. Please try again.");
}

function friendlyRpcError(message: string): string {
  if (/deadlock/i.test(message)) {
    return "Another operation was in progress. Please try again.";
  }
  const cleaned = message.replace(/^.*?error:\s*/i, "").trim();
  return cleaned || "Something went wrong. Please try again.";
}

function accountLabel(account: Pick<Account, "type" | "account_number">): string {
  return `${ACCOUNT_LABELS[account.type]} ${maskAccountNumber(account.account_number)}`;
}

export function accountBlockedMessage(account: Pick<Account, "type" | "account_number" | "status">): string {
  return `Your ${accountLabel(account)} is ${account.status} — money movement is blocked on it. Contact BankSim support to reactivate the account.`;
}

async function getOwnAccount(ctx: ToolContext, accountId: string): Promise<Account | null> {
  const { data } = await ctx.supabase.from("accounts").select("*").eq("id", accountId).maybeSingle();
  return data ?? null;
}

/* Read tools ------------------------------------------------------------------ */

export async function listAccounts(ctx: ToolContext): Promise<ListAccountsResult | ToolErrorResult> {
  const { data, error } = await ctx.supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return unexpectedError();
  const accounts = data ?? [];

  return {
    status: "ok",
    total_balance: formatINR(sumINR(accounts.map((a) => a.balance))),
    accounts: accounts.map((a) => ({
      id: a.id,
      type: a.type,
      type_label: ACCOUNT_LABELS[a.type],
      masked_number: maskAccountNumber(a.account_number),
      ifsc: a.ifsc,
      balance: Number(a.balance),
      balance_formatted: formatINR(a.balance),
      status: a.status,
    })),
  };
}

export async function getTransactions(
  params: {
    account_id: string;
    type?: TxnType;
    direction?: "CREDIT" | "DEBIT";
    date_from?: string;
    date_to?: string;
    search?: string;
    limit: number;
  },
  ctx: ToolContext,
): Promise<ListTransactionsResult | ToolErrorResult> {
  const account = await getOwnAccount(ctx, params.account_id);
  if (!account) {
    return toolError("NOT_FOUND", "I couldn't find that account in your profile. Try listing your accounts first.");
  }

  let query = ctx.supabase
    .from("transactions")
    .select("*")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(params.limit);

  if (params.type) query = query.eq("txn_type", params.type);
  if (params.direction) query = query.eq("direction", params.direction);
  if (params.date_from) {
    query = query.gte("created_at", istDayStartIso(params.date_from));
  }
  if (params.date_to) {
    query = query.lt("created_at", istDayStartIso(params.date_to, 1));
  }
  if (params.search) {
    // Strip PostgREST filter syntax chars so the search term can't break the query.
    const term = params.search.replace(/[%,()\\]/g, " ").trim();
    if (term) {
      query = query.or(`memo.ilike.%${term}%,reference.ilike.%${term}%`);
    }
  }

  const { data, error } = await query;
  if (error) return unexpectedError();

  const rows = data ?? [];
  const transactions: TransactionLedgerRow[] = rows.map((t) => ({
    reference: t.reference,
    direction: t.direction,
    type: t.txn_type,
    type_label: TXN_LABELS[t.txn_type],
    amount_formatted: formatINR(t.amount),
    balance_after_formatted: formatINR(t.balance_after),
    memo: t.memo,
    date: formatIST(t.created_at),
    created_at: t.created_at,
  }));

  return {
    status: "ok",
    account: {
      id: account.id,
      type: account.type,
      type_label: ACCOUNT_LABELS[account.type],
      masked_number: maskAccountNumber(account.account_number),
    },
    transactions,
    count: transactions.length,
    note:
      transactions.length === 0
        ? "No transactions matched those filters."
        : `Showing the ${transactions.length} most recent matching entries, newest first.`,
  };
}

export async function listBeneficiaries(
  ctx: ToolContext,
): Promise<ListBeneficiariesResult | ToolErrorResult> {
  const { data, error } = await ctx.supabase
    .from("beneficiaries")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return unexpectedError();

  const beneficiaries: BeneficiarySummary[] = (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    account_number: b.account_number,
    masked_number: maskAccountNumber(b.account_number),
    ifsc: b.ifsc,
    nickname: b.nickname,
  }));

  return { status: "ok", beneficiaries };
}

export async function listCards(ctx: ToolContext): Promise<ListCardsResult | ToolErrorResult> {
  const { data, error } = await ctx.supabase
    .from("cards")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return unexpectedError();

  const cards = data ?? [];
  const accountIds = Array.from(new Set(cards.map((c) => c.account_id)));
  const accountsById = new Map<string, Account>();

  if (accountIds.length > 0) {
    const { data: accounts, error: accountsError } = await ctx.supabase
      .from("accounts")
      .select("*")
      .in("id", accountIds);
    if (accountsError) return unexpectedError();
    for (const account of accounts ?? []) accountsById.set(account.id, account);
  }

  const summaries: CardSummary[] = cards.flatMap((c) => {
    const account = accountsById.get(c.account_id);
    if (!account) return [];
    return [
      {
        id: c.id,
        masked_number: maskAccountNumber(c.last4),
        network: c.network,
        holder_name: c.holder_name,
        expiry: formatExpiry(c.expiry_month, c.expiry_year),
        status: c.status,
        daily_limit_formatted: formatINR(c.daily_limit),
        account: {
          id: account.id,
          type: account.type,
          type_label: ACCOUNT_LABELS[account.type],
          masked_number: maskAccountNumber(account.account_number),
        },
      },
    ];
  });

  return { status: "ok", cards: summaries };
}

/* Money/account proposals (step 1 — no execution) ---------------------------- */

export type ProposalResult = { ok: true; request: ConfirmationRequest } | ToolErrorResult;

export async function transferProposal(
  p: { from_account_id: string; to_account_number: string; amount: number; memo?: string },
  ctx: ToolContext,
): Promise<ProposalResult> {
  const from = await getOwnAccount(ctx, p.from_account_id);
  if (!from) {
    return toolError("NOT_FOUND", "I couldn't find the account you want to send from. Try listing your accounts first.");
  }
  if (from.status !== "ACTIVE") {
    return toolError("ACCOUNT_BLOCKED", accountBlockedMessage(from));
  }
  if (from.account_number === p.to_account_number) {
    return toolError("INVALID_PARAMS", "That's your own account — choose a different recipient.");
  }
  if (Number(from.balance) < p.amount) {
    return toolError(
      "INSUFFICIENT_FUNDS",
      `Insufficient funds. Your ${accountLabel(from)} has ${formatINR(from.balance)} available, and this transfer is ${formatINR(p.amount)}.`,
    );
  }

  const details = [
    { label: "From", value: accountLabel(from) },
    { label: "To", value: `account ••••${p.to_account_number.slice(-4)}` },
    { label: "Amount", value: formatINR(p.amount) },
  ];
  if (p.memo) details.push({ label: "Memo", value: p.memo });

  return {
    ok: true,
    request: {
      tool: "transfer_money",
      title: `Send ${formatINR(p.amount)} to account ••••${p.to_account_number.slice(-4)}`,
      details,
    },
  };
}

export async function cashProposal(
  direction: "DEPOSIT" | "WITHDRAWAL",
  p: { account_id: string; amount: number; memo?: string },
  ctx: ToolContext,
): Promise<ProposalResult> {
  const account = await getOwnAccount(ctx, p.account_id);
  if (!account) {
    return toolError("NOT_FOUND", "I couldn't find that account in your profile. Try listing your accounts first.");
  }
  if (account.status !== "ACTIVE") {
    return toolError("ACCOUNT_BLOCKED", accountBlockedMessage(account));
  }
  if (direction === "WITHDRAWAL" && Number(account.balance) < p.amount) {
    return toolError(
      "INSUFFICIENT_FUNDS",
      `Insufficient funds. Your ${accountLabel(account)} has ${formatINR(account.balance)} available, and this withdrawal is ${formatINR(p.amount)}.`,
    );
  }

  const verb = direction === "DEPOSIT" ? "Deposit" : "Withdraw";
  const into = direction === "DEPOSIT" ? "into" : "from";
  const details = [
    { label: direction === "DEPOSIT" ? "Account" : "Account", value: accountLabel(account) },
    { label: "Amount", value: formatINR(p.amount) },
  ];
  if (p.memo) details.push({ label: "Memo", value: p.memo });

  return {
    ok: true,
    request: {
      tool: direction === "DEPOSIT" ? "deposit_cash" : "withdraw_cash",
      title: `${verb} ${formatINR(p.amount)} ${into} ${accountLabel(account)}`,
      details,
    },
  };
}

export async function addBeneficiaryProposal(
  p: { name: string; account_number: string; ifsc: string; nickname?: string },
  ctx: ToolContext,
): Promise<ProposalResult> {
  const { data: existing } = await ctx.supabase
    .from("beneficiaries")
    .select("id")
    .eq("account_number", p.account_number)
    .maybeSingle();

  if (existing) {
    return toolError("DUPLICATE", `${p.name} (${maskAccountNumber(p.account_number)}) is already saved as a beneficiary.`);
  }

  const details = [
    { label: "Name", value: p.name },
    { label: "Account", value: maskAccountNumber(p.account_number) },
    { label: "IFSC", value: p.ifsc },
  ];
  if (p.nickname) details.push({ label: "Nickname", value: p.nickname });

  return {
    ok: true,
    request: {
      tool: "add_beneficiary",
      title: `Save beneficiary ${p.name}`,
      details,
    },
  };
}

export async function setCardStatusProposal(
  p: { card_id: string; frozen: boolean },
  ctx: ToolContext,
): Promise<ProposalResult> {
  const { data: card } = await ctx.supabase
    .from("cards")
    .select("*")
    .eq("id", p.card_id)
    .maybeSingle();

  if (!card) {
    return toolError("NOT_FOUND", "I couldn't find that card. Try listing your cards first.");
  }

  const account = await getOwnAccount(ctx, card.account_id);
  if (!account) return unexpectedError();

  const target = p.frozen ? "FROZEN" : "ACTIVE";
  if (card.status === target) {
    return toolError(
      "INVALID_PARAMS",
      p.frozen ? "That card is already frozen." : "That card is already active.",
    );
  }

  return {
    ok: true,
    request: {
      tool: "set_card_status",
      title: `${p.frozen ? "Freeze" : "Unfreeze"} ${card.network} card ••••${card.last4}`,
      details: [
        { label: "Card", value: `${card.network} ••••${card.last4}` },
        { label: "Account", value: accountLabel(account) },
        { label: "New status", value: p.frozen ? "Frozen" : "Active" },
      ],
    },
  };
}

/* Money/account execution (step 2 — only via a redeemed confirmation token) --- */

function receipt(
  tool: ToolReceipt["tool"],
  title: string,
  fields: { amount?: number | null; reference?: string | null; details: ToolReceipt["details"] },
): ToolReceipt {
  return {
    tool,
    title,
    amount: fields.amount != null ? formatINR(fields.amount) : null,
    reference: fields.reference ?? null,
    details: fields.details,
    timestamp: formatIST(new Date()),
  };
}

export async function transferMoney(
  p: { from_account_id: string; to_account_number: string; amount: number; memo?: string },
  ctx: ToolContext,
): Promise<SuccessResult | ToolErrorResult> {
  const { data: reference, error } = await ctx.supabase.rpc("perform_transfer", {
    from_account_id: p.from_account_id,
    to_account_number: p.to_account_number,
    amount: p.amount,
    memo: p.memo || null,
  });
  if (error) return toolError("EXECUTION_FAILED", friendlyRpcError(error.message));

  const from = await getOwnAccount(ctx, p.from_account_id);
  const details = [
    { label: "From", value: from ? accountLabel(from) : "your account" },
    { label: "To", value: `account ••••${p.to_account_number.slice(-4)}` },
  ];
  if (p.memo) details.push({ label: "Memo", value: p.memo });
  if (from) details.push({ label: "New balance", value: formatINR(from.balance) });

  return {
    status: "success",
    receipt: receipt("transfer_money", "Transfer complete", {
      amount: p.amount,
      reference: reference ?? null,
      details,
    }),
  };
}

export async function cashMove(
  direction: "DEPOSIT" | "WITHDRAWAL",
  p: { account_id: string; amount: number; memo?: string },
  ctx: ToolContext,
): Promise<SuccessResult | ToolErrorResult> {
  const { data: reference, error } = await ctx.supabase.rpc("cash_transaction", {
    account_id: p.account_id,
    direction,
    amount: p.amount,
    memo: p.memo || null,
  });
  if (error) return toolError("EXECUTION_FAILED", friendlyRpcError(error.message));

  const account = await getOwnAccount(ctx, p.account_id);
  const details = [{ label: "Account", value: account ? accountLabel(account) : "your account" }];
  if (p.memo) details.push({ label: "Memo", value: p.memo });
  if (account) details.push({ label: "New balance", value: formatINR(account.balance) });

  return {
    status: "success",
    receipt: receipt(
      direction === "DEPOSIT" ? "deposit_cash" : "withdraw_cash",
      direction === "DEPOSIT" ? "Deposit complete" : "Withdrawal complete",
      { amount: p.amount, reference: reference ?? null, details },
    ),
  };
}

export async function addBeneficiary(
  p: { name: string; account_number: string; ifsc: string; nickname?: string },
  ctx: ToolContext,
): Promise<SuccessResult | ToolErrorResult> {
  const { error } = await ctx.supabase.from("beneficiaries").insert({
    user_id: ctx.userId,
    name: p.name,
    account_number: p.account_number,
    ifsc: p.ifsc,
    nickname: p.nickname || null,
  });

  if (error) {
    if (error.code === "23505") {
      return toolError("DUPLICATE", `${p.name} (${maskAccountNumber(p.account_number)}) is already saved as a beneficiary.`);
    }
    return unexpectedError();
  }

  const details = [
    { label: "Name", value: p.name },
    { label: "Account", value: maskAccountNumber(p.account_number) },
    { label: "IFSC", value: p.ifsc },
  ];
  if (p.nickname) details.push({ label: "Nickname", value: p.nickname });

  return {
    status: "success",
    receipt: receipt("add_beneficiary", "Beneficiary saved", { details }),
  };
}

export async function setCardStatus(
  p: { card_id: string; frozen: boolean },
  ctx: ToolContext,
): Promise<SuccessResult | ToolErrorResult> {
  const { data, error } = await ctx.supabase
    .from("cards")
    .update({ status: p.frozen ? "FROZEN" : "ACTIVE" })
    .eq("id", p.card_id)
    .select("id, last4, network");

  if (error || !data || data.length === 0) {
    return toolError("NOT_FOUND", "I couldn't update that card. Try listing your cards and asking again.");
  }

  const card = data[0];
  return {
    status: "success",
    receipt: receipt("set_card_status", p.frozen ? "Card frozen" : "Card unfrozen", {
      details: [
        { label: "Card", value: `${card.network} ••••${card.last4}` },
        { label: "Status", value: p.frozen ? "Frozen" : "Active" },
      ],
    }),
  };
}

/* Helpers ---------------------------------------------------------------------- */

/** Start of an IST calendar day as a UTC ISO instant (for timestamptz filters). */
function istDayStartIso(date: string, dayOffset = 0): string {
  const start = new Date(`${date}T00:00:00+05:30`).getTime() + dayOffset * 86_400_000;
  return new Date(start).toISOString();
}
