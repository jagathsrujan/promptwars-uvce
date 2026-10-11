import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/bits";
import { TransferForm } from "@/components/transfer/transfer-form";

export const metadata: Metadata = { title: "Transfer" };

export default async function TransferPage() {
  await requireUser();
  const supabase = await createClient();

  const [accountsResult, beneficiariesResult] = await Promise.all([
    supabase.from("accounts").select("*").order("created_at", { ascending: true }),
    supabase.from("beneficiaries").select("*").order("name", { ascending: true }),
  ]);

  return (
    <div className="animate-rise-in mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Transfer money"
        description="Send money instantly to any BankSim account. Each transfer is one atomic database transaction."
      />
      <TransferForm
        accounts={accountsResult.data ?? []}
        beneficiaries={beneficiariesResult.data ?? []}
      />
    </div>
  );
}
