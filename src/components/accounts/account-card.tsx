import Link from "next/link";
import type { Account } from "@/lib/types";
import { formatINR, maskAccountNumber } from "@/lib/format";
import { Badge } from "@/components/ui/bits";
import { IconChevronRight } from "@/components/icons";

const TYPE_LABELS: Record<Account["type"], string> = {
  CHECKING: "Checking account",
  SAVINGS: "Savings account",
};

export function AccountCard({ account }: { account: Account }) {
  const active = account.status === "ACTIVE";
  return (
    <Link
      href={`/accounts/${account.id}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-navy-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {TYPE_LABELS[account.type]}
          </p>
          <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
            {formatINR(account.balance)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!active ? (
            <Badge tone={account.status === "FROZEN" ? "amber" : "red"}>
              {account.status === "FROZEN" ? "Frozen" : "Closed"}
            </Badge>
          ) : null}
          <IconChevronRight className="h-4 w-4 text-slate-300 transition group-hover:text-navy-600" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span className="font-mono tracking-widest">{maskAccountNumber(account.account_number)}</span>
        <span className="font-mono">IFSC {account.ifsc}</span>
      </div>
    </Link>
  );
}
