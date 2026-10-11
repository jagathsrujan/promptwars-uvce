// L2 — deep analysis via deepseek/deepseek-v4.1-flash on /chat/completions.
//
// Runs only on escalation (gray-zone probabilities, soft L0 signals, or a
// composite score at the block threshold). One call, temperature 0.1,
// `x-cmd-zdr: 1` (banking data, zero data retention), structured JSON out.
//
// Fail closed: any failure — network, timeout, non-200, non-JSON, schema
// mismatch — throws FirewallUnavailableError and the pipeline blocks.

import { z } from "zod";
import { ASSISTANT_MODEL_ID, COMMANDCODE_BASE_URL } from "@/lib/assistant/model";
import { FIREWALL_CLASSIFIER_PROMPT, buildClassifierUserMessage } from "./classifier-prompt";
import { FirewallUnavailableError } from "./l1";
import { isThreatCategory, type L1Probabilities, type L2Analysis } from "./types";
import { normalizeSanitizedIntent } from "./verdict";

export const L2_TIMEOUT_MS = 8000;
export const L2_MAX_INPUT_CHARS = 800;
/**
 * deepseek-v4.1-flash is a reasoning model: the reasoning tokens count against
 * max_tokens, so the budget must leave room for the JSON verdict afterwards.
 * Too small a budget returns an empty `content` — which fails closed, but for
 * the wrong reason.
 */
export const L2_MAX_OUTPUT_TOKENS = 1200;

const l2Schema = z.object({
  status: z.enum(["APPROVED", "BLOCKED"]),
  risk_score: z.number().finite(),
  threat_category: z.string(),
  explanation: z.string().min(1).max(600),
  sanitized_intent: z
    .object({ intent: z.string(), summary: z.string() })
    .nullable()
    .optional()
    .default(null),
});

/** The text L2 sees: normalized, capped head+tail so late attacks still show. */
export function classifierInput(state: string): string {
  if (state.length <= L2_MAX_INPUT_CHARS) return state;
  return `${state.slice(0, 600)} … [truncated] … ${state.slice(-200)}`;
}

/** Extract the first JSON object from a model response (fences tolerated). */
export function extractJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new FirewallUnavailableError("l2", "The deep-analysis response contained no JSON object.");
  }
  try {
    return JSON.parse(trimmed.slice(first, last + 1));
  } catch {
    throw new FirewallUnavailableError("l2", "The deep-analysis response was not valid JSON.");
  }
}

export function parseL2Response(content: string): L2Analysis {
  const parsed = l2Schema.safeParse(extractJson(content));
  if (!parsed.success) {
    throw new FirewallUnavailableError("l2", "The deep-analysis response did not match the verdict schema.");
  }
  const data = parsed.data;
  return {
    status: data.status,
    risk_score: Math.max(0, Math.min(100, Math.round(data.risk_score))),
    threat_category: isThreatCategory(data.threat_category) ? data.threat_category : "PROMPT_INJECTION",
    explanation: data.explanation.trim(),
    sanitized_intent: normalizeSanitizedIntent(data.sanitized_intent),
    raw: content.trim().slice(0, 2000),
  };
}

/** One deep-analysis call. Throws FirewallUnavailableError on any failure. */
export async function callDeepAnalysis(args: {
  kind: "message" | "memo";
  state: string;
  l1: L1Probabilities;
  timeoutMs?: number;
}): Promise<L2Analysis> {
  const apiKey = process.env.COMMANDCODE_API_KEY;
  if (!apiKey) {
    throw new FirewallUnavailableError("l2", "COMMANDCODE_API_KEY is not configured.");
  }

  const timeoutMs = args.timeoutMs ?? L2_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${COMMANDCODE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "x-cmd-zdr": "1",
      },
      body: JSON.stringify({
        model: ASSISTANT_MODEL_ID,
        temperature: 0.1,
        max_tokens: L2_MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: FIREWALL_CLASSIFIER_PROMPT },
          {
            role: "user",
            content: buildClassifierUserMessage({
              kind: args.kind,
              state: classifierInput(args.state),
              l1: args.l1,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new FirewallUnavailableError("l2", `The deep-analysis model answered ${response.status}.`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new FirewallUnavailableError("l2", "The deep-analysis model returned an empty response.");
    }
    return parseL2Response(content);
  } catch (error) {
    if (error instanceof FirewallUnavailableError) throw error;
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${timeoutMs} ms`
        : "call failed";
    throw new FirewallUnavailableError("l2", `The deep-analysis model ${reason}.`);
  } finally {
    clearTimeout(timer);
  }
}
