import type { Metadata } from "next";
import Link from "next/link";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Transaction } from "@/lib/types";
import { formatINR, formatISTToday, greetingIST, sumINR } from "@/lib/format";
import { AccountCard } from "@/components/accounts/account-card";
import { TransactionList } from "@/components/transactions/transaction-list";
import { EmptyState } from "@/components/ui/bits";
import {
  IconBell,
  IconChevronRight,
  IconStatement,
  IconTransfer,
  IconWallet,
} from "@/components/icons";

export const metadata: Metadata = { title: "Dashboard" };

const QUICK_ACTIONS = [
  {
    href: "/transfer",
    label: "Transfer",
    hint: "Send money to any BankSim account",
    Icon: IconTransfer,
  },
  {
    href: "/deposit-withdraw",
    label: "Deposit / Withdraw",
    hint: "Move cash in or out of an account",
    Icon: IconWallet,
  },
  {
    href: "/transactions",
    label: "Statement",
    hint: "Filter, paginate and export CSV",
    Icon: IconStatement,
  },
] as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [profileResult, accountsResult, unreadResult] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("accounts").select("*").order("created_at", { ascending: true }),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
  ]);

  const accounts = accountsResult.data ?? [];
  const accountIds = accounts.map((a) => a.id);

  const recentResult = accountIds.length
    ? await supabase
        .from("transactions")
        .select("*")
        .in("account_id", accountIds)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] as Transaction[] };

  const recent = recentResult.data ?? [];
  const totalBalance = sumINR(accounts.map((a) => a.balance));
  const unreadCount = unreadResult.count ?? 0;
  const firstName = (profileResult.data?.full_name ?? "").trim().split(/\s+/)[0];

  return (
    <div className="animate-rise-in space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {greetingIST()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{formatISTToday()} · all times in IST</p>
        </div>
        <Link
          href="/notifications"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-navy-300 hover:text-navy-800"
        >
          <IconBell className="h-4 w-4 text-slate-400" />
          Notifications
          {unreadCount > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Link>
      </header>

      <section aria-labelledby="accounts-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 id="accounts-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your accounts
          </h2>
          <p className="text-sm text-slate-500">
            Total balance{" "}
            <span className="font-semibold tabular-nums text-slate-900">{formatINR(totalBalance)}</span>
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      </section>

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Quick actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {QUICK_ACTIONS.map(({ href, label, hint, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-navy-300 hover:shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700 transition group-hover:bg-navy-900 group-hover:text-white">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{label}</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{hint}</span>
              </span>
              <IconChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-navy-600" />
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="activity-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h2 id="activity-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent activity
          </h2>
          <Link
            href="/transactions"
            className="text-sm font-semibold text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
          >
            View statement
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={<IconTransfer className="h-5 w-5" />}
            title="No activity yet"
            description="Your ledger is empty. Make your first transfer or deposit and it will show up here instantly."
            action={
              <Link
                href="/transfer"
                className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-navy-800"
              >
                Make a transfer
              </Link>
            }
          />
        ) : (
          <TransactionList transactions={recent} accounts={accounts} />
        )}
      </section>
    </div>
  );
}
