// GET /api/cron/tune — hourly adaptive-learner tune. LOG-ONLY stub.
//
// The adaptive learner (src/lib/firewall/adaptive.ts) never auto-pushes: this
// cron observes and proposes. Every run appends findings to the server log:
//   * REVIEW precision: when REVIEW verdicts resolve > 80% hostile on
//     re-screen, propose +5 to the L0 weight of the top REVIEW rule — as a
//     PR-comment-shaped log line a human copies into a real change;
//   * escalation doubling: when escalations in the last hour are >= 2x the
//     trailing 7-day hourly mean, freeze learning to the last profile version
//     and raise an audit flag (the freeze itself is applied by an operator —
//     this stub only reports it);
//   * shadow scoring: new candidate weights are scored log-only for 24h
//     (reported here, never applied).
//
// No database writes, no weight changes, no profile mutations. VPC-only by
// construction (same Next.js server, same RLS-scoped reads).

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REVIEW_PRECISION_THRESHOLD = 0.8;
const ESCALATION_MULTIPLE = 2;

type TuneFinding =
  | { kind: "review_precision"; precision: number; topRule: string | null; proposal: string }
  | { kind: "escalation_freeze"; lastHour: number; hourlyMean: number; audit: boolean }
  | { kind: "shadow_score"; note: string };

function startOfHourIso(now: Date): string {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Cron auth: Vercel Cron sends its own bearer; a signed-in operator may
  // also trigger it manually from the server. Anonymous calls are refused.
  if (!user && process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const hourStart = startOfHourIso(now);
  const dayStart = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString();
  const findings: TuneFinding[] = [];

  // REVIEW precision over the last 24h: REVIEW rows whose follow-up
  // re-screen (same user, later BLOCKED hostile) confirmed the suspicion.
  const { data: reviews } = await supabase
    .from("firewall_logs")
    .select("id, user_id, threat_category, signals, created_at")
    .eq("status", "REVIEW")
    .gte("created_at", dayStart)
    .limit(500);

  if (reviews && reviews.length > 0) {
    const { data: followups } = await supabase
      .from("firewall_logs")
      .select("user_id, status, threat_category")
      .eq("status", "BLOCKED")
      .gte("created_at", dayStart)
      .limit(1000);
    const hostileUsers = new Set(
      (followups ?? [])
        .filter((f) => f.threat_category !== "NONE" && f.threat_category !== "AMBIGUOUS_INPUT")
        .map((f) => f.user_id),
    );
    const confirmed = reviews.filter((r) => hostileUsers.has(r.user_id)).length;
    const precision = confirmed / reviews.length;
    const ruleCounts = new Map<string, number>();
    for (const r of reviews) {
      const signals = (r.signals ?? []) as Array<{ rule?: string }>;
      for (const s of signals) {
        if (typeof s.rule === "string") ruleCounts.set(s.rule, (ruleCounts.get(s.rule) ?? 0) + 1);
      }
    }
    const topRule = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (precision > REVIEW_PRECISION_THRESHOLD && topRule) {
      const proposal =
        `PR proposal (human applies): +5 L0 weight to rule "${topRule}" — ` +
        `REVIEW precision ${(precision * 100).toFixed(1)}% over ${reviews.length} reviews/24h exceeds 80%.`;
      findings.push({ kind: "review_precision", precision, topRule, proposal });
      console.log(`[tune] ${proposal}`);
    } else {
      console.log(
        `[tune] REVIEW precision ${(precision * 100).toFixed(1)}% over ${reviews.length} reviews/24h — below 80%, no proposal.`,
      );
    }
  } else {
    console.log("[tune] No REVIEW verdicts in the last 24h — nothing to tune.");
  }

  // Escalation doubling: escalations (L2/JEV_CLOUD/REVIEW decisions) in the
  // last hour vs the trailing 7-day hourly mean.
  const { count: lastHour } = await supabase
    .from("firewall_logs")
    .select("id", { count: "exact", head: true })
    .in("deciding_layer", ["L2", "JEV_CLOUD"])
    .gte("created_at", hourStart);
  const { count: lastWeek } = await supabase
    .from("firewall_logs")
    .select("id", { count: "exact", head: true })
    .in("deciding_layer", ["L2", "JEV_CLOUD"])
    .gte("created_at", weekStart);
  const hourlyMean = (lastWeek ?? 0) / (7 * 24);
  if ((lastHour ?? 0) >= Math.max(4, ESCALATION_MULTIPLE * hourlyMean) && hourlyMean > 0) {
    findings.push({
      kind: "escalation_freeze",
      lastHour: lastHour ?? 0,
      hourlyMean,
      audit: true,
    });
    console.log(
      `[tune] AUDIT FLAG: escalations ${lastHour}/h vs 7d mean ${hourlyMean.toFixed(2)}/h (>= 2x) — ` +
        `operator action: freeze adaptive learning to the last profile version (user_risk_profiles.frozen = true).`,
    );
  } else {
    console.log(
      `[tune] Escalations ${lastHour ?? 0}/h vs 7d mean ${hourlyMean.toFixed(2)}/h — within bounds.`,
    );
  }

  // Shadow scoring: candidate weights are scored log-only for 24h. No-op
  // until an operator proposes a candidate — the stub reports its absence.
  findings.push({
    kind: "shadow_score",
    note: "No candidate weights under shadow scoring. To shadow: log candidate {rule, weight} here; scoring runs log-only for 24h before any human PR.",
  });
  console.log("[tune] Shadow scoring: no candidates — log-only, nothing applied.");

  return Response.json({ ok: true, at: now.toISOString(), findings });
}
