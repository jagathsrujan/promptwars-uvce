import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Transaction } from "@/lib/types";
import { PageHeader } from "@/components/ui/bits";
import { StatementTable } from "@/components/statements/statement-table";

export const metadata: Metadata = { title: "Statement" };

export default async function TransactionsPage() {
  await requireUser();
  const supabase = await createClient();

  const accountsResult = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });
  const accounts = accountsResult.data ?? [];
  const accountIds = accounts.map((a) => a.id);

  const transactionsResult = accountIds.length
    ? await supabase
        .from("transactions")
        .select("*")
        .in("account_id", accountIds)
        .order("created_at", { ascending: false })
        .limit(1000)
    : { data: [] as Transaction[] };

  return (
    <div className="animate-rise-in space-y-6">
      <PageHeader
        title="Statement"
        description="Every ledger entry across your accounts. Filter, search, paginate, and export the result as CSV."
      />
      <StatementTable
        transactions={transactionsResult.data ?? []}
        accounts={accounts}
      />
    </div>
  );
}
