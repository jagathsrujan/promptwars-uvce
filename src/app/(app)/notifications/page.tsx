import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/bits";
import { NotificationsClient } from "@/components/notifications/notifications-client";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="animate-rise-in mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        description="Transfer receipts, deposit confirmations and security alerts. Click any item to toggle read state."
      />
      <NotificationsClient notifications={notifications ?? []} />
    </div>
  );
}
