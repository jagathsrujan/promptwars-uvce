import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Transaction } from "@/lib/types";
import { formatINR, formatISTDate, maskAccountNumber } from "@/lib/format";
import { Badge, PageHeader, buttonStyles } from "@/components/ui/bits";
import { RevealNumber } from "@/components/accounts/reveal-number";
import { CardWidget } from "@/components/accounts/card-widget";
import { TransactionList } from "@/components/transactions/transaction-list";
import {
  IconCard,
  IconChevronLeft,
  IconStatement,
  IconTransfer,
} from "@/components/icons";

export const metadata: Metadata = { title: "Account" };

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!account) {
    notFound();
  }

  const [cardResult, txnsResult] = await Promise.all([
    supabase.from("cards").select("*").eq("account_id", account.id).maybeSingle(),
    supabase
      .from("transactions")
      .select("*")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const card = cardResult.data;
  const transactions: Transaction[] = txnsResult.data ?? [];
  const active = account.status === "ACTIVE";
  const typeLabel = account.type === "CHECKING" ? "Checking account" : "Savings account";

  return (
    <div className="animate-rise-in space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-navy-800"
        >
          <IconChevronLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>

      <PageHeader
        title={typeLabel}
        description={`Account ${maskAccountNumber(account.account_number)} · IFSC ${account.ifsc}`}
        actions={
          <Badge tone={active ? "emerald" : account.status === "FROZEN" ? "amber" : "red"}>
            {active ? "Active" : account.status === "FROZEN" ? "Frozen" : "Closed"}
          </Badge>
        }
      />

      {!active ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
          This account is {account.status}. Money movement is blocked on it — deposits,
          withdrawals and transfers involving it will be rejected with a clear error.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Available balance
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
              {formatINR(account.balance)}
            </p>

            <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Account number</dt>
                <dd className="mt-1">
                  <RevealNumber accountNumber={account.account_number} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">IFSC</dt>
                <dd className="mt-1 font-mono text-sm text-slate-800">{account.ifsc}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Opened</dt>
                <dd className="mt-1 text-slate-800">{formatISTDate(account.created_at)}</dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/transfer" className={buttonStyles.primary}>
                <IconTransfer className="h-4 w-4" />
                Transfer
              </Link>
              <Link href="/transactions" className={buttonStyles.secondary}>
                <IconStatement className="h-4 w-4" />
                Full statement
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-2 flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Last 10 transactions
              </h2>
              <Link
                href="/transactions"
                className="text-sm font-semibold text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
              >
                View all
              </Link>
            </div>
            <TransactionList transactions={transactions} accounts={[account]} />
          </section>
        </div>

        <div>
          {card ? (
            <CardWidget card={card} />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <IconCard className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">No card issued</h3>
              <p className="mt-1 text-sm text-slate-500">
                Savings accounts in BankSim don&apos;t come with a card. Your checking
                account has one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
