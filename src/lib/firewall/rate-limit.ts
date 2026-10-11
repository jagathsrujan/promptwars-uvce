// Rate limits + tool lockout — L3 guardrails, computed from the audit log.
//
// All counts come from firewall_logs (indexed, RLS-scoped to the caller), so
// there is no separate in-memory state to drift or lose:
//   * 30 chat messages / 5 minutes,
//   * 10 executed money operations / hour,
//   * 5 hostile BLOCKED verdicts / 10 minutes → 15-minute money-tool lockout.
//
// Console runs are deliberately excluded from every count — the Firewall
// Console is a test harness, and you must be able to exercise the firewall
// (including its lockout) without locking your own demo out of the product.
//
// Lockout only gates money/account tools. Read-only chat (balances,
// statements) stays available.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { HOSTILE_THREAT_CATEGORIES } from "./types";

type Supabase = SupabaseClient<Database>;

export const RATE_LIMITS = {
  messages: { max: 30, window_minutes: 5 },
  money_ops: { max: 10, window_minutes: 60 },
  lockout: { hostile_blocks: 5, window_minutes: 10, lockout_minutes: 15 },
} as const;

/** Surfaces whose decisions count toward limits (console runs never do). */
const COUNTED_SURFACES = ["chat", "memo", "confirm"] as const;

/* Pure lockout computation (unit-tested) ---------------------------------------- */

export function lockoutFromTimestamps(
  timestamps: string[],
  now: Date,
): { locked: boolean; until: string | null; recent_blocks: number } {
  const windowStart = now.getTime() - RATE_LIMITS.lockout.window_minutes * 60_000;
  const recent = timestamps
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t) && t >= windowStart)
    .sort((a, b) => b - a);

  if (recent.length < RATE_LIMITS.lockout.hostile_blocks) {
    return { locked: false, until: null, recent_blocks: recent.length };
  }

  const until = new Date(recent[0] + RATE_LIMITS.lockout.lockout_minutes * 60_000);
  return {
    locked: until.getTime() > now.getTime(),
    until: until.toISOString(),
    recent_blocks: recent.length,
  };
}

/* Counts (RLS-scoped to the signed-in user) ---------------------------------------- */

function windowStartIso(windowMinutes: number, now: Date): string {
  return new Date(now.getTime() - windowMinutes * 60_000).toISOString();
}

export async function countRecentMessages(
  supabase: Supabase,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await supabase
    .from("firewall_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("surface", "chat")
    .gte("created_at", windowStartIso(RATE_LIMITS.messages.window_minutes, now));
  return count ?? 0;
}

export async function countRecentExecutions(
  supabase: Supabase,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await supabase
    .from("firewall_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("executed", true)
    .gte("created_at", windowStartIso(RATE_LIMITS.money_ops.window_minutes, now));
  return count ?? 0;
}

export async function getLockoutState(
  supabase: Supabase,
  userId: string,
  now: Date = new Date(),
): Promise<{ locked: boolean; until: string | null; recent_blocks: number }> {
  const { data } = await supabase
    .from("firewall_logs")
    .select("created_at")
    .eq("user_id", userId)
    .eq("status", "BLOCKED")
    .in("threat_category", [...HOSTILE_THREAT_CATEGORIES])
    .in("surface", [...COUNTED_SURFACES])
    .gte("created_at", windowStartIso(RATE_LIMITS.lockout.window_minutes, now))
    .order("created_at", { ascending: false })
    .limit(RATE_LIMITS.lockout.hostile_blocks);

  return lockoutFromTimestamps((data ?? []).map((row) => row.created_at), now);
}

export type RateLimitState = {
  messages_used: number;
  money_ops_used: number;
  locked_until: string | null;
  recent_hostile_blocks: number;
};

export async function getRateLimitState(
  supabase: Supabase,
  userId: string,
  now: Date = new Date(),
): Promise<RateLimitState> {
  const [messages, executions, lockout] = await Promise.all([
    countRecentMessages(supabase, userId, now),
    countRecentExecutions(supabase, userId, now),
    getLockoutState(supabase, userId, now),
  ]);
  return {
    messages_used: messages,
    money_ops_used: executions,
    locked_until: lockout.locked ? lockout.until : null,
    recent_hostile_blocks: lockout.recent_blocks,
  };
}
