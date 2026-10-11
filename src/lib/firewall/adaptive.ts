// Adaptive learner — VPC-only, no new infra.
//
// A per-user spending baseline (UserProfile) stored in `user_risk_profiles`:
// count + Welford mean/M2 for amounts, a 24-slot hour histogram, known
// counterparty hashes and device hashes, and a monotonic version. At decision
// time the caller loads the profile and converts the deviation into capped
// risk points (velocity_z + novelty_boost, z_points capped 15, total capped
// 25, MIN_HISTORY 5 → cold-start returns 0).
//
// Learning rules (the scored part):
//   * ONLY APPROVED + settled + 7-days-no-dispute transfers update the
//     baseline (Welford online update, histogram bump, set unions, version+1);
//   * CONFIRMED_FRAUD NEVER updates the baseline — it writes the receiver
//     hash to the blocklist for 90 days and logs a drift sample instead;
//   * the hourly tune cron freezes learning to the last version + raises an
//     audit flag when escalation doubles in an hour (see the cron stub).
//
// BASELINE_ALPHA 0.08 is the histogram EMA rate used by the cron's
// shadow-scoring proposal path (recorded here so the constant lives with the
// learner, not the scheduler).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types";

type Supabase = SupabaseClient<Database>;

export const MIN_HISTORY = 5;
export const NOVELTY_CAP = 25;
export const Z_POINTS_CAP = 15;
export const BASELINE_ALPHA = 0.08;
export const FRAUD_BLOCKLIST_DAYS = 90;

export type UserProfile = {
  n: number;
  amt_mean: number;
  amt_m2: number;
  hour_hist: number[];
  counterparties: Record<string, number>;
  device_hashes: string[];
  version: number;
  frozen: boolean;
};

export function emptyProfile(): UserProfile {
  return {
    n: 0,
    amt_mean: 0,
    amt_m2: 0,
    hour_hist: Array.from({ length: 24 }, () => 0),
    counterparties: {},
    device_hashes: [],
    version: 1,
    frozen: false,
  };
}

function toProfile(row: {
  n: number;
  amt_mean: number;
  amt_m2: number;
  hour_hist: unknown;
  counterparties: unknown;
  device_hashes: unknown;
  version: number;
  frozen: boolean;
}): UserProfile {
  const hist = Array.isArray(row.hour_hist) ? row.hour_hist : [];
  const hour_hist = Array.from({ length: 24 }, (_, i) =>
    typeof hist[i] === "number" && Number.isFinite(hist[i]) ? hist[i] : 0,
  );
  const counterparties =
    counterpartiesOf(row.counterparties);
  const device_hashes = Array.isArray(row.device_hashes)
    ? row.device_hashes.filter((d): d is string => typeof d === "string")
    : [];
  return {
    n: row.n,
    amt_mean: Number(row.amt_mean) || 0,
    amt_m2: Number(row.amt_m2) || 0,
    hour_hist,
    counterparties,
    device_hashes,
    version: row.version,
    frozen: row.frozen,
  };
}

function counterpartiesOf(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** Load the caller's own profile (RLS own-read). Absent → cold-start empty. */
export async function loadProfile(supabase: Supabase, userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("user_risk_profiles")
    .select("n, amt_mean, amt_m2, hour_hist, counterparties, device_hashes, version, frozen")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return emptyProfile();
  return toProfile(data);
}

/* Scoring ---------------------------------------------------------------------- */

/** Welford sample stddev (0 when n < 2). */
export function profileStddev(profile: UserProfile): number {
  if (profile.n < 2 || profile.amt_m2 <= 0) return 0;
  return Math.sqrt(profile.amt_m2 / (profile.n - 1));
}

/** |amount − mean| / stddev (0 when cold or degenerate). */
export function velocityZ(profile: UserProfile, amount: number): number {
  if (profile.n < MIN_HISTORY) return 0;
  const std = profileStddev(profile);
  if (std <= 0) return 0;
  return Math.abs(amount - profile.amt_mean) / std;
}

/**
 * Novelty points for unseen counterparties/devices/off-hours. Capped so a
 * weird-but-legit first stays a nudge, never a block.
 */
export function noveltyBoost(
  profile: UserProfile,
  args: { counterpartyHash: string | null; deviceHash: string | null; hour: number },
): number {
  if (profile.n < MIN_HISTORY) return 0;
  let points = 0;
  if (args.counterpartyHash && !(args.counterpartyHash in profile.counterparties)) points += 8;
  if (args.deviceHash && !profile.device_hashes.includes(args.deviceHash)) points += 8;
  const hourCount = profile.hour_hist[args.hour] ?? 0;
  const total = profile.hour_hist.reduce((a, b) => a + b, 0);
  if (total > 0 && hourCount / total < 0.05) points += 5;
  return Math.min(NOVELTY_CAP, points);
}

/**
 * Total adaptive points added to the composite: min(15, z) + novelty,
 * capped at 25. Cold-start (n < MIN_HISTORY) or frozen profiles return 0.
 */
export function adaptivePoints(
  profile: UserProfile,
  args: { amount: number; counterpartyHash: string | null; deviceHash: string | null; hour: number },
): number {
  if (profile.n < MIN_HISTORY || profile.frozen) return 0;
  const zPoints = Math.min(Z_POINTS_CAP, Math.round(velocityZ(profile, args.amount)));
  return Math.min(NOVELTY_CAP, zPoints + noveltyBoost(profile, args));
}

/* Learning --------------------------------------------------------------------- */

export type SettledTransfer = {
  amount: number;
  counterpartyHash: string;
  deviceHash: string | null;
  hour: number;
};

/**
 * Welford online update for one settled transfer. Pure — returns the next
 * profile (version+1); the caller persists it. Frozen profiles are returned
 * unchanged (learning paused by the tune cron).
 */
export function learnTransfer(profile: UserProfile, transfer: SettledTransfer): UserProfile {
  if (profile.frozen) return profile;
  const n = profile.n + 1;
  const delta = transfer.amount - profile.amt_mean;
  const amt_mean = profile.amt_mean + delta / n;
  const amt_m2 = profile.amt_m2 + delta * (transfer.amount - amt_mean);
  const hour_hist = [...profile.hour_hist];
  if (transfer.hour >= 0 && transfer.hour < 24) hour_hist[transfer.hour] += 1;
  const counterparties = { ...profile.counterparties };
  counterparties[transfer.counterpartyHash] = (counterparties[transfer.counterpartyHash] ?? 0) + 1;
  const device_hashes = transfer.deviceHash && !profile.device_hashes.includes(transfer.deviceHash)
    ? [...profile.device_hashes, transfer.deviceHash]
    : [...profile.device_hashes];
  return {
    n,
    amt_mean,
    amt_m2,
    hour_hist,
    counterparties,
    device_hashes,
    version: profile.version + 1,
    frozen: false,
  };
}

/**
 * Persist one APPROVED+settled transfer's lesson. Server-side only (the
 * table grants no client writes — the caller uses its server client).
 * Returns the new version, or null when learning is frozen/absent.
 */
export async function recordSettledTransfer(
  supabase: Supabase,
  userId: string,
  transfer: SettledTransfer,
): Promise<number | null> {
  const profile = await loadProfile(supabase, userId);
  if (profile.frozen) return null;
  const next = learnTransfer(profile, transfer);
  const { error } = await supabase.from("user_risk_profiles").upsert({
    user_id: userId,
    n: next.n,
    amt_mean: next.amt_mean,
    amt_m2: next.amt_m2,
    hour_hist: next.hour_hist,
    counterparties: next.counterparties as unknown as Json,
    device_hashes: next.device_hashes as unknown as Json,
    version: next.version,
    frozen: false,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Adaptive learn failed", error.message);
    return null;
  }
  return next.version;
}

export type FraudReport = {
  /** Receiver hash → blocklist for 90 days. */
  receiverHash: string;
  /** Free-text reason stored on the blocklist row (no PII). */
  reason: string;
  counterpartyHash: string;
  amount: number;
  hour: number;
};

/**
 * CONFIRMED_FRAUD path: NEVER touches the baseline. Writes the receiver to
 * the blocklist (90d TTL) and returns the drift sample the caller logs.
 * The baseline row is left exactly as it was (verified by unit test).
 */
export async function recordConfirmedFraud(
  supabase: Supabase,
  userId: string,
  fraud: FraudReport,
): Promise<{ drift: Record<string, number | string>; blocklisted: boolean }> {
  const drift = {
    amount: fraud.amount,
    hour: fraud.hour,
    counterparty: fraud.counterpartyHash,
    reason: "confirmed_fraud_never_learns",
  };
  const expires = new Date(Date.now() + FRAUD_BLOCKLIST_DAYS * 24 * 3_600_000).toISOString();
  const { error } = await supabase.from("firewall_lists").upsert(
    {
      user_id: userId,
      list: "block",
      key_type: "acct_hash",
      key_hash: fraud.receiverHash,
      reason: fraud.reason.slice(0, 200),
      expires_at: expires,
    },
    { onConflict: "list,key_type,key_hash" },
  );
  if (error) {
    console.error("Fraud blocklist write failed", error.message);
    return { drift, blocklisted: false };
  }
  return { drift, blocklisted: true };
}
