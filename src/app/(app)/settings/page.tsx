import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { PageHeader } from "@/components/ui/bits";
import { SettingsClient } from "@/components/settings/settings-client";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const resolvedProfile: Profile = profile ?? {
    id: user.id,
    full_name: "",
    phone: null,
    created_at: user.created_at ?? new Date().toISOString(),
  };

  return (
    <div className="animate-rise-in mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        description="Your profile, password and session."
      />
      <SettingsClient profile={resolvedProfile} email={user.email ?? ""} />
    </div>
  );
}
