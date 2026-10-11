// GET /api/firewall/feed — the console's live data: the latest decisions
// (RLS-scoped to the caller) plus today's stats. Polled by the console.

import { createClient } from "@/lib/supabase/server";
import { fetchRecentDecisions, fetchTodayStats } from "@/lib/firewall/logs";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const [items, stats] = await Promise.all([
    fetchRecentDecisions(supabase, 50),
    fetchTodayStats(supabase),
  ]);

  return Response.json({ items, stats, fetched_at: new Date().toISOString() });
}
