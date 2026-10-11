// Laya — the local/edge gatekeeper (Vega-class, open-source).
//
// High-velocity in-VPC triage: the same five typed questions as L1_QUESTIONS
// (instruction_override / exfiltration / roleplay_hijack / social_pressure as
// probabilities, request_clarity as a score), answered locally via an
// Ollama/MLX OpenAI-compatible endpoint (LAYA_BASE_URL, model LAYA_MODEL).
// The state is PII-redacted before it ever reaches the local model — Laya
// never sees raw PII in, and never sends raw PII out (probabilities only).
//
// Wire format: native Ollama `/api/generate` with `format: "json"` and
// temperature 0. The prompt embeds the five L1 question wordings verbatim so
// the local gate scores the same threats as the cloud classifier; the JSON
// contract is flat ({ instruction_override, …, request_clarity: { score,
// probabilities } }) and parseLayaAnswers also tolerates the jev envelope.
// Clarity distribution is DERIVED from the score (unclear = 1 − score/2) —
// small local models emit unreliable probability splits, so the score is the
// only clarity signal trusted.
//
// Enhancement layer, not a replacement: when LAYA_BASE_URL is unset (Vercel
// prod), callLaya() returns null and the pipeline falls back to the existing
// L0+L1 path exactly as today. Any timeout/garbage → FirewallUnavailableError
// ("laya") → the pipeline BLOCKS fail-closed, never approves.
//
// Local demo note: the 50 ms spec budget assumes lab hardware. This MacBook
// needs seconds for a 1.5b model, so LAYA_TIMEOUT_MS (env override) covers
// measured inference; LAYA_LOCAL_DEMO=1 keeps the 150 ms spec value.
//
// No key material: the local endpoint is unauthenticated by design (same VPC).

import { FirewallUnavailableError, L1_QUESTIONS } from "./l1";
import { redactMemo } from "./tokenise";
import type { L1Probabilities } from "./types";

export const LAYA_DEFAULT_MODEL = "qwen2.5:1.5b";
export const LAYA_TIMEOUT_MS = 50;
export const LAYA_DEMO_TIMEOUT_MS = 150;

export type LayaResult = {
  probs: L1Probabilities;
  latency_ms: number;
};

function layaTimeout(): number {
  const override = Number(process.env.LAYA_TIMEOUT_MS);
  if (Number.isFinite(override) && override > 0) return override;
  return process.env.LAYA_LOCAL_DEMO === "1" ? LAYA_DEMO_TIMEOUT_MS : LAYA_TIMEOUT_MS;
}

export function layaConfigured(): boolean {
  return Boolean(process.env.LAYA_BASE_URL?.trim());
}

function layaBaseUrl(): string {
  return (process.env.LAYA_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

function layaModel(): string {
  return process.env.LAYA_MODEL?.trim() || LAYA_DEFAULT_MODEL;
}

/** The scorer prompt: the five L1 question wordings + a flat JSON contract. */
export function buildLayaPrompt(state: string): string {
  return [
    "You are a bank security scorer. Score the banking request below.",
    'Reply with ONLY one JSON object, no other text: {"instruction_override": 0.0-1.0, "exfiltration": 0.0-1.0, "roleplay_hijack": 0.0-1.0, "social_pressure": 0.0-1.0, "request_clarity": {"score": 0.0-2.0}}.',
    `instruction_override: ${L1_QUESTIONS.instruction_override.instructions}`,
    `exfiltration: ${L1_QUESTIONS.exfiltration.instructions}`,
    `roleplay_hijack: ${L1_QUESTIONS.roleplay_hijack.instructions}`,
    `social_pressure: ${L1_QUESTIONS.social_pressure.instructions}`,
    `request_clarity score: ${L1_QUESTIONS.request_clarity.instructions} 0 Unclear, 1 Partially clear, 2 Fully clear.`,
    "INPUT BEGIN",
    state,
    "INPUT END",
  ].join("\n");
}

/** Coerce one probability; garbage → fail closed. */
function prob(value: unknown, key: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new FirewallUnavailableError("laya", `Missing or invalid "${key}" probability.`);
  }
  return n;
}

/**
 * Parse a Laya answer payload. Accepts the flat Ollama shape
 * ({ instruction_override, …, request_clarity: { score } }) and the jev
 * envelope ({ answers }). Clarity probabilities are derived from the score:
 * unclear = 1 − score/2 clamped to [0,1] (messages gate at ≥ 0.50).
 */
export function parseLayaAnswers(payload: unknown): L1Probabilities {
  const root = (payload ?? {}) as Record<string, unknown>;
  const answers = (root.answers ?? root) as Record<string, unknown>;
  if (!answers || typeof answers !== "object") {
    throw new FirewallUnavailableError("laya", "The local gatekeeper returned no answers.");
  }
  const read = (key: string): unknown => {
    const answer = answers[key] as { noul?: unknown } | number | undefined;
    if (answer !== null && typeof answer === "object" && "noul" in answer) {
      return (answer as { noul?: unknown }).noul;
    }
    return answer;
  };
  const clarityRaw = answers.request_clarity as { score?: unknown } | number | undefined;
  const scoreRaw =
    typeof clarityRaw === "object" && clarityRaw !== null ? Number(clarityRaw.score) : Number(clarityRaw);
  if (!Number.isFinite(scoreRaw) || scoreRaw < 0 || scoreRaw > 2) {
    throw new FirewallUnavailableError("laya", "Missing or invalid clarity score.");
  }
  const score = scoreRaw;
  const unclear = Math.max(0, Math.min(1, 1 - score / 2));
  return {
    instruction_override: prob(read("instruction_override"), "instruction_override"),
    exfiltration: prob(read("exfiltration"), "exfiltration"),
    roleplay_hijack: prob(read("roleplay_hijack"), "roleplay_hijack"),
    social_pressure: prob(read("social_pressure"), "social_pressure"),
    clarity: {
      score,
      unclear,
      partial: Math.max(0, Math.min(1, 1 - Math.abs(score - 1))),
      fully: Math.max(0, Math.min(1, score / 2)),
    },
  };
}

/** Extract the JSON object from an Ollama response string (fences tolerated). */
export function extractLayaJson(response: string): unknown {
  const trimmed = response.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new FirewallUnavailableError("laya", "The local gatekeeper returned no JSON object.");
  }
  try {
    return JSON.parse(trimmed.slice(first, last + 1));
  } catch {
    throw new FirewallUnavailableError("laya", "The local gatekeeper returned invalid JSON.");
  }
}

/**
 * One local gatekeeper call. Returns null when unconfigured (fallback to
 * L0+L1). Throws FirewallUnavailableError on any failure — fail closed.
 */
export async function callLaya(
  state: string,
  timeoutMs?: number,
): Promise<LayaResult | null> {
  if (!layaConfigured()) return null;
  const budget = timeoutMs ?? layaTimeout();
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  try {
    const response = await fetch(`${layaBaseUrl()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: layaModel(),
        // Redacted at the edge: raw PII never reaches even the local model.
        prompt: buildLayaPrompt(redactMemo(state)),
        stream: false,
        format: "json",
        options: { temperature: 0 },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new FirewallUnavailableError("laya", `The local gatekeeper answered ${response.status}.`);
    }
    const envelope = (await response.json()) as { response?: unknown };
    if (typeof envelope.response !== "string" || !envelope.response.trim()) {
      throw new FirewallUnavailableError("laya", "The local gatekeeper returned an empty response.");
    }
    const probs = parseLayaAnswers(extractLayaJson(envelope.response));
    return { probs, latency_ms: Date.now() - started };
  } catch (error) {
    if (error instanceof FirewallUnavailableError) throw error;
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${budget} ms`
        : "call failed";
    throw new FirewallUnavailableError("laya", `The local gatekeeper ${reason}.`);
  } finally {
    clearTimeout(timer);
  }
}
