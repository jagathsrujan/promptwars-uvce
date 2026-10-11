// Firewall audit log — persistence, feed hydration and console stats.
//
// Every decision is written to firewall_logs with the caller's own RLS-scoped
// client (no service role anywhere). Writes are best-effort: a failed audit
// insert must never turn into an approval or a crash — it is logged to the
// server console instead.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, FirewallLog, Json } from "@/lib/types";
import {
  HOSTILE_THREAT_CATEGORIES,
  type DecidingLayer,
  type FirewallDecision,
  type FirewallFailureLayer,
  type FirewallInputKind,
  type FirewallSignal,
  type FirewallStatus,
  type FirewallSurface,
  type L1Probabilities,
  type L2Analysis,
  type ThreatCategory,
} from "./types";

type Supabase = SupabaseClient<Database>;

/* Writes -------------------------------------------------------------------------- */

export async function logDecision(
  supabase: Supabase,
  userId: string,
  decision: FirewallDecision,
  extra?: { executed?: boolean; audit?: boolean },
): Promise<FirewallLog | null> {
  const { data, error } = await supabase
    .from("firewall_logs")
    .insert({
      user_id: userId,
      surface: decision.surface,
      input: decision.input.slice(0, 4000),
      status: decision.verdict.status,
      risk_score: decision.verdict.risk_score,
      threat_category: decision.verdict.threat_category,
      explanation: decision.verdict.explanation.slice(0, 500),
      deciding_layer: decision.verdict.deciding_layer,
      signals: decision.verdict.signals as unknown as Json,
      layer_details: {
        normalized: decision.normalized,
        stripped_chars: decision.stripped_chars,
        truncated: decision.truncated,
        kind: decision.kind,
        failure_layer: decision.failure_layer,
        l0: decision.l0,
        l1: decision.l1,
        l2: decision.l2,
      } as unknown as Json,
      intent: decision.verdict.sanitized_intent?.intent ?? null,
      latency_ms: decision.latency_ms,
      executed: extra?.executed ?? false,
      audit: extra?.audit ?? decision.verdict.threat_category === "RATE_LIMIT",
    })
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Failed to write the firewall audit log", error.message);
    return null;
  }
  return data;
}

/* Feed + stats ---------------------------------------------------------------------- */

export type FirewallFeedItem = {
  id: string;
  created_at: string;
  surface: FirewallSurface;
  input: string;
  kind: FirewallInputKind;
  status: FirewallStatus;
  risk_score: number;
  threat_category: ThreatCategory;
  explanation: string;
  deciding_layer: DecidingLayer;
  signals: FirewallSignal[];
  normalized: string;
  stripped_chars: number;
  truncated: boolean;
  l0: FirewallDecision["l0"] | null;
  l1: L1Probabilities | null;
  l2: L2Analysis | null;
  failure_layer: FirewallFailureLayer;
  latency_ms: number;
  executed: boolean;
  audit: boolean;
};

export type FirewallStats = {
  total: number;
  approved: number;
  blocked: number;
  approval_rate: number;
  executed: number;
  blocks_by_layer: Record<DecidingLayer, number>;
  top_categories: Array<{ category: ThreatCategory; count: number }>;
  avg_latency_ms: number;
};

type LayerDetails = {
  normalized?: string;
  stripped_chars?: number;
  truncated?: boolean;
  kind?: FirewallInputKind;
  failure_layer?: FirewallFailureLayer;
  l0?: FirewallDecision["l0"];
  l1?: L1Probabilities | null;
  l2?: L2Analysis | null;
};

export function hydrateLog(row: FirewallLog): FirewallFeedItem {
  const details = (row.layer_details ?? {}) as LayerDetails;
  return {
    id: row.id,
    created_at: row.created_at,
    surface: row.surface,
    input: row.input,
    kind: details.kind ?? "message",
    status: row.status,
    risk_score: row.risk_score,
    threat_category: row.threat_category as ThreatCategory,
    explanation: row.explanation,
    deciding_layer: row.deciding_layer,
    signals: (row.signals ?? []) as unknown as FirewallSignal[],
    normalized: details.normalized ?? "",
    stripped_chars: details.stripped_chars ?? 0,
    truncated: details.truncated ?? false,
    l0: details.l0 ?? null,
    l1: details.l1 ?? null,
    l2: details.l2 ?? null,
    failure_layer: details.failure_layer ?? null,
    latency_ms: row.latency_ms,
    executed: row.executed,
    audit: row.audit,
  };
}

export async function fetchRecentDecisions(
  supabase: Supabase,
  limit = 50,
): Promise<FirewallFeedItem[]> {
  const { data, error } = await supabase
    .from("firewall_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to read the firewall audit log", error.message);
    return [];
  }
  return (data ?? []).map(hydrateLog);
}

/** Midnight today in Asia/Kolkata, as a UTC instant. */
export function startOfTodayIST(now: Date = new Date()): Date {
  const istOffsetMs = 5.5 * 3_600_000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const startUtc = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  return new Date(startUtc - istOffsetMs);
}

export function computeStats(items: FirewallFeedItem[]): FirewallStats {
  const blocksByLayer: Record<DecidingLayer, number> = {
    L0: 0,
    L1: 0,
    L2: 0,
    L3: 0,
    FAIL_CLOSED: 0,
  };
  const categories = new Map<ThreatCategory, number>();
  let approved = 0;
  let blocked = 0;
  let executed = 0;
  let latencySum = 0;

  for (const item of items) {
    if (item.status === "APPROVED") approved += 1;
    else {
      blocked += 1;
      blocksByLayer[item.deciding_layer] += 1;
    }
    if (item.executed) executed += 1;
    latencySum += item.latency_ms;
    if (
      item.threat_category !== "NONE" &&
      (HOSTILE_THREAT_CATEGORIES as readonly string[]).includes(item.threat_category)
    ) {
      categories.set(item.threat_category, (categories.get(item.threat_category) ?? 0) + 1);
    }
  }

  const total = items.length;
  return {
    total,
    approved,
    blocked,
    approval_rate: total > 0 ? Math.round((approved / total) * 100) : 100,
    executed,
    blocks_by_layer: blocksByLayer,
    top_categories: [...categories.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    avg_latency_ms: total > 0 ? Math.round(latencySum / total) : 0,
  };
}

export async function fetchTodayStats(supabase: Supabase): Promise<FirewallStats> {
  const { data, error } = await supabase
    .from("firewall_logs")
    .select("*")
    .gte("created_at", startOfTodayIST().toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Failed to read firewall stats", error.message);
    return computeStats([]);
  }
  return computeStats((data ?? []).map(hydrateLog));
}
