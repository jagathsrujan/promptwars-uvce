import type { Account, Transaction } from "@/lib/types";
import { cn } from "@/lib/cn";
import { formatINR, formatIST, maskAccountNumber } from "@/lib/format";
import { TXN_TYPE_LABELS } from "@/lib/constants";
import { EmptyState, TransactionAmount } from "@/components/ui/bits";
import { IconArrowDownLeft, IconArrowUpRight, IconStatement } from "@/components/icons";

export function TransactionList({
  transactions,
  accounts,
  showBalance = false,
}: {
  transactions: Transaction[];
  accounts?: Account[];
  showBalance?: boolean;
}) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<IconStatement className="h-5 w-5" />}
        title="No transactions yet"
        description="Once money moves in or out of your accounts, every entry will appear here with its reference and balance."
      />
    );
  }

  const byId = new Map((accounts ?? []).map((a) => [a.id, a]));

  return (
    <ul className="divide-y divide-slate-100">
      {transactions.map((t) => {
        const credit = t.direction === "CREDIT";
        const counterparty = t.counterparty_account_id
          ? byId.get(t.counterparty_account_id)
          : null;
        const source = byId.get(t.account_id);
        return (
          <li key={t.id} className="flex items-center gap-3 py-3.5">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                credit ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
              )}
            >
              {credit ? (
                <IconArrowDownLeft className="h-4 w-4" />
              ) : (
                <IconArrowUpRight className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {t.memo || TXN_TYPE_LABELS[t.txn_type]}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {formatIST(t.created_at)} · {TXN_TYPE_LABELS[t.txn_type]}
                {showBalance && source ? ` · A/C ${maskAccountNumber(source.account_number)}` : ""}
                {counterparty
                  ? ` · ${credit ? "from" : "to"} ${maskAccountNumber(counterparty.account_number)}`
                  : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <TransactionAmount value={t.amount} direction={t.direction} className="text-sm" />
              {showBalance ? (
                <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                  Bal {formatINR(t.balance_after)}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
