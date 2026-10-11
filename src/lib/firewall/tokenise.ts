// Tokeniser — Phase 4 cascade: anonymize before the cloud auditor sees anything.
//
// Jev (cloud) only ever receives anonymized FEATURES, never raw PII: the raw
// name/phone/email/ip/device_id/account numbers are dropped at the VPC edge,
// replaced with salted HMAC tokens (HMAC_SHA256(DAILY_SALT), truncated to 16
// hex chars) plus a last-4 suffix where a human still needs to disambiguate
// (account numbers, card PANs). The memo is PII-redacted with the same regex
// family as the console never-logs rules and head+tail capped (400 + 100, the
// same shape as classifierState). Velocity is aggregates-only.
//
// DAILY_SALT is server-only (process.env.JEV_DAY_SALT, rotated daily, never
// logged, never committed, never NEXT_PUBLIC_). The caller resolves velocity
// features and identity context from its own RLS-scoped queries — this module
// is pure: same inputs, same bundle, no I/O.

import { createHmac } from "node:crypto";
import { classifierState } from "./normalize";
import type { TokenisedForJev, VelocityFeatures } from "./types";

/** HMAC_SHA256(salt, value), hex, truncated to 16 chars. Stable per salt. */
export function hmacToken(salt: string, value: string): string {
  return createHmac("sha256", salt).update(value, "utf8").digest("hex").slice(0, 16);
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Indian numbers with the +91 country prefix hash the same as the bare
  // 10-digit form — the prefix adds no identity signal.
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}

function last4(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

/* PII redaction for the memo --------------------------------------------------- */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;
const LONG_DIGITS_RE = /\d{9,}/g;

export function redactMemo(memo: string): string {
  const text = (memo ?? "").normalize("NFKC");
  const redacted = text
    .replace(EMAIL_RE, "[PERSON]")
    .replace(PHONE_RE, "[PHONE]")
    .replace(LONG_DIGITS_RE, "[ACCT]");
  return classifierState(redacted);
}

/* IP / address bucketing (coarse geography only — never a full address) -------- */

export function ipPrefix(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  // IPv4 → /24. IPv6/abnormal → a short HMAC bucket so nothing raw leaks.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(trimmed);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  return null;
}

export function postalPrefix(postal: string | null | undefined): string | null {
  const digits = (postal ?? "").replace(/\D/g, "");
  if (digits.length < 3) return null;
  return digits.slice(0, 3);
}

/* The bundle -------------------------------------------------------------------- */

export type TokeniseInput = {
  /** Server-only salt (JEV_DAY_SALT). Never logged. */
  salt: string;
  /** Canonical sender account number (raw). Only the hash + last4 leave. */
  accountNumber: string;
  counterpartyAccount?: string | null;
  deviceId?: string | null;
  email?: string | null;
  phone?: string | null;
  ip?: string | null;
  /** Coarse ASN label (e.g. "as45609"), never a raw route. */
  asnBucket?: string | null;
  cityCode?: string | null;
  postalCode?: string | null;
  /** Sender address vs profile address mismatch (caller-computed). */
  addrMismatch?: boolean | null;
  /** Card BIN tier label (e.g. "visa_classic"), never the PAN. */
  binTier?: string | null;
  /** Full PAN only to derive the last4 — never stored, never emitted. */
  pan?: string | null;
  amountInr?: number | null;
  /** Hour bucket the caller computed (YYYY-MM-DDTHH). */
  hourBucket?: string | null;
  velocity?: VelocityFeatures | null;
  memo: string;
};

export function emptyVelocity(): VelocityFeatures {
  return {
    count_24h: 0,
    sum_24h: 0,
    distinct_cp: 0,
    new_beneficiary_bool: false,
    baseline_z: 0,
  };
}

export function tokeniseForJev(input: TokeniseInput): TokenisedForJev {
  const salt = input.salt;
  const acctLast4 = last4(input.accountNumber);
  return {
    acct_hash: hmacToken(salt, `acct:${input.accountNumber.trim()}`),
    acct_last4: acctLast4,
    counterparty_hash: input.counterpartyAccount
      ? hmacToken(salt, `acct:${input.counterpartyAccount.trim()}`)
      : null,
    device_hash: input.deviceId ? hmacToken(salt, `device:${input.deviceId.trim()}`) : null,
    email_hash: input.email ? hmacToken(salt, `email:${input.email.trim().toLowerCase()}`) : null,
    phone_hash: input.phone ? hmacToken(salt, `phone:${normalizePhone(input.phone)}`) : null,
    ip_prefix: ipPrefix(input.ip),
    asn_bucket: input.asnBucket?.trim() || null,
    city_code: input.cityCode?.trim() || null,
    postal_prefix: postalPrefix(input.postalCode),
    addr_mismatch: input.addrMismatch ?? null,
    bin_tier: input.binTier?.trim() || null,
    pan_last4: input.pan ? last4(input.pan) : null,
    amount_inr: typeof input.amountInr === "number" && Number.isFinite(input.amountInr) ? input.amountInr : null,
    hour_bucket: input.hourBucket?.trim() || null,
    velocity_features: input.velocity ?? null,
    redacted_memo: redactMemo(input.memo),
  };
}

/** Fail-closed scan: assert no raw PII-shaped value survived tokenisation. */
export function tokenisedLeaksRaw(bundle: TokenisedForJev, raws: Array<string | null | undefined>): string[] {
  const haystack = JSON.stringify(bundle);
  const leaks: string[] = [];
  for (const raw of raws) {
    const value = (raw ?? "").trim();
    if (value.length >= 6 && haystack.includes(value)) {
      leaks.push(value);
    }
  }
  return leaks;
}
