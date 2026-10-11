import type { ReactNode } from "react";
import { createClient, requireUser } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();

  const [profileResult, unreadResult] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
  ]);

  const profileName = profileResult.data?.full_name?.trim();
  const displayName = profileName || user.email?.split("@")[0] || "Customer";

  return (
    <AppShell
      user={{ name: displayName, email: user.email ?? "" }}
      unreadCount={unreadResult.count ?? 0}
    >
      {children}
    </AppShell>
  );
}
