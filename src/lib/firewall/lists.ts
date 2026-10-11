// PayPal-style lists — allowlist / blocklist / reviewlist.
//
// Membership is keyed by salted hashes (acct_hash / device_hash from
// tokenise.ts), never raw identifiers. Semantics:
//   * blocklist hit → BLOCKED 100 at L3, zero model cost (checked first);
//   * allowlist hit → feeds the Laya trust conjunction (allowlisted salary +
//     known device + known beneficiary + risk < 25 → fast-approve);
//   * reviewlist hit → forces the REVIEW band (step-up) even for clean scores.
// Console runs are exempt (same rule as the rate limits): the console is a
// test harness and must never be gated by production lists.
//
// Reads are RLS own-read (the caller passes its session client); writes are
// server-only (service path — never from the browser). This module is the
// read path used by the pipeline callers; writes happen in adaptive.ts
// (fraud → blocklist) and the tune cron (review precision proposals).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import type { ListHits } from "./types";

type Supabase = SupabaseClient<Database>;

export type ListKey = { key_type: "acct_hash" | "device_hash"; key_hash: string };

/** Resolve membership for a set of hashes. Expired rows are ignored. */
export async function resolveListHits(
  supabase: Supabase,
  userId: string,
  keys: ListKey[],
): Promise<ListHits> {
  const empty: ListHits = { blocklisted: false, allowlisted: false, reviewlisted: false };
  if (keys.length === 0) return empty;

  const hashes = [...new Set(keys.map((k) => k.key_hash))];
  const { data, error } = await supabase
    .from("firewall_lists")
    .select("list, key_type, key_hash, expires_at")
    .eq("user_id", userId)
    .in("key_hash", hashes);

  if (error || !data) {
    // A list lookup failure must never approve — but it must also never
    // block: the pipeline treats unknown as absent and the classifiers
    // still run. Fail-open on the LIST ONLY (the verdict still fails closed
    // on classifier outage).
    console.error("List lookup failed; treating as absent", error?.message);
    return empty;
  }

  const now = Date.now();
  const live = data.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now);
  const wanted = new Set(keys.map((k) => `${k.key_type}:${k.key_hash}`));
  const hits: ListHits = { ...empty };
  for (const row of live) {
    if (!wanted.has(`${row.key_type}:${row.key_hash}`)) continue;
    if (row.list === "block") hits.blocklisted = true;
    else if (row.list === "allow") hits.allowlisted = true;
    else if (row.list === "review") hits.reviewlisted = true;
  }
  return hits;
}

/** Console runs are exempt from list gating (test harness, like rate limits). */
export function listsForSurface(
  surface: "chat" | "memo" | "console" | "confirm",
  hits: ListHits | null,
): ListHits | null {
  if (surface === "console") return null;
  return hits;
}
