import { createClient, requireUser } from "@/lib/supabase/server";
import { fetchRecentDecisions, fetchTodayStats } from "@/lib/firewall/logs";
import { FirewallConsole } from "@/components/firewall/console";

export const dynamic = "force-dynamic";

export default async function FirewallPage() {
  await requireUser();
  const supabase = await createClient();

  const [items, stats] = await Promise.all([
    fetchRecentDecisions(supabase, 50),
    fetchTodayStats(supabase),
  ]);

  return <FirewallConsole initialItems={items} initialStats={stats} />;
}
