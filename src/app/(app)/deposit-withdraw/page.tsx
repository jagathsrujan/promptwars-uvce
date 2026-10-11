import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/bits";
import { CashForm } from "@/components/cash/cash-form";

export const metadata: Metadata = { title: "Deposit / Withdraw" };

export default async function DepositWithdrawPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div className="animate-rise-in mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Deposit / Withdraw"
        description="Move cash in or out of your accounts. Every entry gets a reference and appears instantly on your statement."
      />
      <CashForm accounts={accounts ?? []} />
    </div>
  );
}
