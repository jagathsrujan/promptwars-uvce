import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/bits";
import { BeneficiariesClient } from "@/components/beneficiaries/beneficiaries-client";

export const metadata: Metadata = { title: "Beneficiaries" };

export default async function BeneficiariesPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: beneficiaries } = await supabase
    .from("beneficiaries")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div className="animate-rise-in mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Beneficiaries"
        description="People and accounts you can transfer to in one tap."
      />
      <BeneficiariesClient beneficiaries={beneficiaries ?? []} />
    </div>
  );
}
