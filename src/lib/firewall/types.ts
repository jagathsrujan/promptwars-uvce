// The firewall's verdict contract and shared constants.
//
// This file is the single source of truth for the shapes that ship everywhere:
// the JSON stored in firewall_logs, rendered by the Firewall Console, attached
// to chat messages, and returned by every decision — the problem statement's
// required output is exactly `FirewallVerdict`.

/* Intents --------------------------------------------------------------------- */

/** The only intents the firewall will ever approve — everything else is refused. */
export const FIREWALL_INTENTS = [
  "BALANCE_CHECK",
  "TRANSFER",
  "DEPOSIT",
  "WITHDRAW",
  "TRANSACTION_HISTORY",
  "ADD_BENEFICIARY",
  "SET_CARD_STATUS",
] as const;
export type FirewallIntent = (typeof FIREWALL_INTENTS)[number];

export function isFirewallIntent(value: unknown): value is FirewallIntent {
  return typeof value === "string" && (FIREWALL_INTENTS as readonly string[]).includes(value);
}

/* Threats, layers, statuses ---------------------------------------------------- */

export const THREAT_CATEGORIES = [
  "NONE",
  "PROMPT_INJECTION",
  "JAILBREAK",
  "ROLEPLAY_ATTACK",
  "HIDDEN_INSTRUCTION",
  "DATA_EXFILTRATION",
  "SOCIAL_ENGINEERING",
  "AMBIGUOUS_INPUT",
  "VALIDATION_FAILURE",
  "RATE_LIMIT",
] as const;
export type ThreatCategory = (typeof THREAT_CATEGORIES)[number];

export function isThreatCategory(value: unknown): value is ThreatCategory {
  return typeof value === "string" && (THREAT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Categories that count as hostile for the block→lockout counter. Ambiguous
 * input and rate limiting are deliberately excluded: asking a vague question,
 * or hitting a budget, must never lock a customer out of their own money.
 */
export const HOSTILE_THREAT_CATEGORIES: readonly ThreatCategory[] = [
  "PROMPT_INJECTION",
  "JAILBREAK",
  "ROLEPLAY_ATTACK",
  "HIDDEN_INSTRUCTION",
  "DATA_EXFILTRATION",
  "SOCIAL_ENGINEERING",
];

export const DECIDING_LAYERS = ["L0", "L1", "L2", "L3", "FAIL_CLOSED", "LAYA_LOCAL", "JEV_CLOUD"] as const;
export type DecidingLayer = (typeof DECIDING_LAYERS)[number];

export type FirewallStatus = "APPROVED" | "BLOCKED" | "REVIEW";
export type FirewallSurface = "chat" | "memo" | "console" | "confirm";
/** Messages and console runs are requests; memos are free text attached to one. */
export type FirewallInputKind = "message" | "memo";

/* Signals ---------------------------------------------------------------------- */

export type FirewallSignal = {
  layer: DecidingLayer;
  rule: string;
  weight: number;
  probability?: number;
  span?: [number, number] | null;
  detail?: string;
};

export type SanitizedIntent = {
  intent: FirewallIntent;
  summary: string;
};

/* The verdict ------------------------------------------------------------------ */

export type FirewallVerdict = {
  status: FirewallStatus;
  risk_score: number;
  threat_category: ThreatCategory;
  explanation: string;
  deciding_layer: DecidingLayer;
  signals: FirewallSignal[];
  sanitized_intent: SanitizedIntent | null;
};

/* Layer reports ----------------------------------------------------------------- */

export type SignatureHit = {
  rule: string;
  weight: number;
  span: [number, number] | null;
  detail: string;
  hard: boolean;
  category: ThreatCategory;
};

export type L0Report = {
  raw: string;
  normalized: string;
  squashed: string;
  strippedChars: number;
  invisibleCount: number;
  interleavedInvisible: number;
  foldedChars: number;
  combiningInterleaved: number;
  truncated: boolean;
  isEmpty: boolean;
  hits: SignatureHit[];
  hardBlocked: boolean;
  escalates: boolean;
  riskContribution: number;
  topCategory: ThreatCategory | null;
};

export type L1Probabilities = {
  instruction_override: number;
  exfiltration: number;
  roleplay_hijack: number;
  social_pressure: number;
  clarity: {
    score: number;
    unclear: number;
    partial: number;
    fully: number;
  };
};

export type L2Analysis = {
  status: FirewallStatus;
  risk_score: number;
  threat_category: ThreatCategory;
  explanation: string;
  sanitized_intent: SanitizedIntent | null;
  raw: string;
};

export type FirewallFailureLayer = "jev" | "l2" | "laya" | null;

/** Everything a single run produced — the verdict plus the evidence behind it. */
export type FirewallDecision = {
  verdict: FirewallVerdict;
  input: string;
  surface: FirewallSurface;
  kind: FirewallInputKind;
  normalized: string;
  stripped_chars: number;
  truncated: boolean;
  l0: {
    hits: SignatureHit[];
    risk_contribution: number;
    hard_blocked: boolean;
    escalated: boolean;
    interleaved_invisible: number;
    folded_chars: number;
    combining_interleaved: number;
  };
  l1: L1Probabilities | null;
  l2: L2Analysis | null;
  failure_layer: FirewallFailureLayer;
  ok: boolean;
  latency_ms: number;
  /* Phase 4 cascade evidence (absent on the Phase 3 fallback path). */
  /** Local gatekeeper result — null when LAYA_BASE_URL is unset (fallback). */
  laya?: { probs: L1Probabilities; latency_ms: number } | null;
  /** Anonymized bundle sent to the cloud auditor — null when never escalated. */
  tokenised?: TokenisedForJev | null;
  /** Adaptive per-user boost applied to the composite (0 when cold/absent). */
  adaptive_boost?: number;
  /** List membership resolved by the caller (null on console runs — exempt). */
  list_hits?: ListHits | null;
};

/* Scoring + routing ------------------------------------------------------------- */

/** Weight per jev question (probability × weight), per the Phase 3 spec. */
export const RISK_WEIGHTS = {
  instruction_override: 40,
  exfiltration: 35,
  roleplay_hijack: 30,
  social_pressure: 20,
} as const;

export const THRESHOLDS = {
  /** Deterministic block: risk_score >= 40. */
  block_score: 40,
  /** Confirmed jev signal. */
  signal: 0.75,
  /** At or above this probability (or any soft L0 signal >= 25), escalate to L2. */
  escalate: 0.4,
  /** Deterministic L1 block on a single probability. */
  hard_block_p: 0.9,
  /** P("Unclear") at or above this on a message → AMBIGUOUS_INPUT. */
  unclear_p: 0.5,
  /** Soft L0 signals at/above this weight also force deep analysis. */
  soft_escalate_weight: 25,
  /** L2 approving with a risk this high is contradictory — fail safe. */
  l2_contradiction_score: 70,
} as const;

/** Map each jev question to its threat category (argmax → verdict category). */
export const QUESTION_CATEGORIES = {
  instruction_override: "PROMPT_INJECTION",
  exfiltration: "DATA_EXFILTRATION",
  roleplay_hijack: "ROLEPLAY_ATTACK",
  social_pressure: "SOCIAL_ENGINEERING",
} as const satisfies Record<string, ThreatCategory>;

export const JEV_QUESTION_KEYS = [
  "instruction_override",
  "exfiltration",
  "roleplay_hijack",
  "social_pressure",
] as const;
export type JevQuestionKey = (typeof JEV_QUESTION_KEYS)[number];

/* Phase 4 cascade — anonymized cloud-auditor bundle + trust signals ------------- */

/** Velocity-only features: counts and aggregates, never raw PII. */
export type VelocityFeatures = {
  count_24h: number;
  sum_24h: number;
  distinct_cp: number;
  new_beneficiary_bool: boolean;
  baseline_z: number;
};

/**
 * The anonymized bundle Jev (cloud auditor) sees — raw name/phone/email/
 * ip/device_id/account numbers NEVER leave the VPC. Hashes are
 * HMAC_SHA256(DAILY_SALT) truncated to 16 hex chars plus a last-4 suffix
 * where a human still needs to disambiguate; the memo is PII-redacted and
 * head+tail capped (same 400+100 shape as classifierState).
 */
export type TokenisedForJev = {
  acct_hash: string;
  acct_last4: string;
  counterparty_hash: string | null;
  device_hash: string | null;
  email_hash: string | null;
  phone_hash: string | null;
  ip_prefix: string | null;
  asn_bucket: string | null;
  city_code: string | null;
  postal_prefix: string | null;
  addr_mismatch: boolean | null;
  bin_tier: string | null;
  pan_last4: string | null;
  amount_inr: number | null;
  hour_bucket: string | null;
  velocity_features: VelocityFeatures | null;
  redacted_memo: string;
};

/** PayPal-style list membership resolved before any model call. */
export type ListHits = {
  blocklisted: boolean;
  allowlisted: boolean;
  reviewlisted: boolean;
};

/** Trust conjunction for the Laya fast-approve path. */
export type CascadeTrust = {
  allowlistedSalary: boolean;
  knownDevice: boolean;
  knownBeneficiary: boolean;
};

/** One-sentence, user-facing explanations for deterministic blocks. */
export const BLOCK_EXPLANATIONS: Record<ThreatCategory, string> = {
  NONE: "Blocked by the security firewall — nothing was executed.",
  PROMPT_INJECTION:
    "I can't act on that — it tries to change my operating instructions, so it was blocked and nothing was executed.",
  JAILBREAK:
    "I can't act on that — it tries to disable my safety rules, so it was blocked and nothing was executed.",
  ROLEPLAY_ATTACK:
    "I can't act on that — it tries to make me act as a different persona, so it was blocked and nothing was executed.",
  HIDDEN_INSTRUCTION:
    "I can't act on that — it hides instructions inside the text, so it was blocked and nothing was executed.",
  DATA_EXFILTRATION:
    "I can't act on that — it asks for internal or other customers' information, which I can never share.",
  SOCIAL_ENGINEERING:
    "I can't act on that — it uses urgency or pressure to push a financial action, so it was blocked and nothing was executed.",
  AMBIGUOUS_INPUT:
    "I couldn't safely interpret that request — please say exactly what you'd like (amount, account and recipient).",
  VALIDATION_FAILURE:
    "I can't act on that — it didn't pass the bank's safety checks, so nothing was executed.",
  RATE_LIMIT:
    "That's too many requests for now — please wait a while, then try again.",
};
