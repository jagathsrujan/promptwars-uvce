import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLayaPrompt,
  callLaya,
  extractLayaJson,
  layaConfigured,
  LAYA_DEFAULT_MODEL,
  parseLayaAnswers,
} from "./laya";
import { FirewallUnavailableError } from "./l1";

function flatAnswers(overrides: Record<string, unknown> = {}) {
  return {
    instruction_override: 0.1,
    exfiltration: 0.05,
    roleplay_hijack: 0.02,
    social_pressure: 0.03,
    request_clarity: { score: 1.6 },
    ...overrides,
  };
}

function ollamaEnvelope(payload: unknown) {
  return { response: JSON.stringify(payload) };
}

const ORIGINAL_BASE = process.env.LAYA_BASE_URL;
const ORIGINAL_MODEL = process.env.LAYA_MODEL;
const ORIGINAL_DEMO = process.env.LAYA_LOCAL_DEMO;
const ORIGINAL_TIMEOUT = process.env.LAYA_TIMEOUT_MS;

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_BASE === undefined) delete process.env.LAYA_BASE_URL;
  else process.env.LAYA_BASE_URL = ORIGINAL_BASE;
  if (ORIGINAL_MODEL === undefined) delete process.env.LAYA_MODEL;
  else process.env.LAYA_MODEL = ORIGINAL_MODEL;
  if (ORIGINAL_DEMO === undefined) delete process.env.LAYA_LOCAL_DEMO;
  else process.env.LAYA_LOCAL_DEMO = ORIGINAL_DEMO;
  if (ORIGINAL_TIMEOUT === undefined) delete process.env.LAYA_TIMEOUT_MS;
  else process.env.LAYA_TIMEOUT_MS = ORIGINAL_TIMEOUT;
});

describe("layaConfigured", () => {
  it("is false when LAYA_BASE_URL is unset (Vercel fallback)", () => {
    delete process.env.LAYA_BASE_URL;
    expect(layaConfigured()).toBe(false);
  });

  it("is true when LAYA_BASE_URL is set", () => {
    process.env.LAYA_BASE_URL = "http://localhost:11434";
    expect(layaConfigured()).toBe(true);
  });

  it("defaults the model to the local gatekeeper model", () => {
    expect(LAYA_DEFAULT_MODEL).toBe("qwen2.5:1.5b");
  });
});

describe("buildLayaPrompt", () => {
  it("embeds the redacted state and the JSON contract", () => {
    const prompt = buildLayaPrompt("pay Rahul 500 [PHONE]");
    expect(prompt).toContain("pay Rahul 500 [PHONE]");
    expect(prompt).toContain("instruction_override");
    expect(prompt).toContain("INPUT BEGIN");
  });
});

describe("parseLayaAnswers", () => {
  it("parses the flat Ollama shape and derives clarity from the score", () => {
    const parsed = parseLayaAnswers(flatAnswers());
    expect(parsed.instruction_override).toBe(0.1);
    expect(parsed.exfiltration).toBe(0.05);
    expect(parsed.roleplay_hijack).toBe(0.02);
    expect(parsed.social_pressure).toBe(0.03);
    expect(parsed.clarity.score).toBe(1.6);
    // unclear = 1 − 1.6/2 = 0.2 → below the 0.50 gate.
    expect(parsed.clarity.unclear).toBeCloseTo(0.2, 6);
  });

  it("maps score 0 to fully unclear and score 2 to fully clear", () => {
    expect(parseLayaAnswers(flatAnswers({ request_clarity: { score: 0 } })).clarity.unclear).toBe(1);
    const clear = parseLayaAnswers(flatAnswers({ request_clarity: { score: 2 } })).clarity;
    expect(clear.unclear).toBe(0);
    expect(clear.fully).toBe(1);
  });

  it("still accepts the jev envelope", () => {
    const parsed = parseLayaAnswers({
      answers: {
        instruction_override: { type: "noul", noul: 0.1 },
        exfiltration: { type: "noul", noul: 0.05 },
        roleplay_hijack: { type: "noul", noul: 0.02 },
        social_pressure: { type: "noul", noul: 0.03 },
        request_clarity: { score: 1.6 },
      },
    });
    expect(parsed.instruction_override).toBe(0.1);
  });

  it("rejects out-of-range probabilities and bad scores fail-closed", () => {
    expect(() => parseLayaAnswers(flatAnswers({ instruction_override: 2 }))).toThrowError(
      FirewallUnavailableError,
    );
    expect(() => parseLayaAnswers(flatAnswers({ request_clarity: { score: 5 } }))).toThrowError(
      FirewallUnavailableError,
    );
    expect(() => parseLayaAnswers({})).toThrowError(FirewallUnavailableError);
    expect(() => parseLayaAnswers(null)).toThrowError(FirewallUnavailableError);
  });

  it("reports garbage as a laya FirewallUnavailableError", () => {
    try {
      parseLayaAnswers({ answers: null });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FirewallUnavailableError);
      expect((error as FirewallUnavailableError).layer).toBe("laya");
    }
  });
});

describe("extractLayaJson", () => {
  it("parses the response string and tolerates fences", () => {
    expect(extractLayaJson(JSON.stringify(flatAnswers()))).toEqual(flatAnswers());
    expect(extractLayaJson("```json\n" + JSON.stringify(flatAnswers()) + "\n```")).toEqual(flatAnswers());
  });

  it("throws fail-closed on non-JSON", () => {
    expect(() => extractLayaJson("the model said nothing structured")).toThrowError(
      FirewallUnavailableError,
    );
  });
});

describe("callLaya", () => {
  it("returns null when unconfigured — no fetch, pipeline falls back", async () => {
    delete process.env.LAYA_BASE_URL;
    const spy = vi.fn(async () => ({}) as Response);
    vi.stubGlobal("fetch", spy);
    expect(await callLaya("what is my balance?")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("posts the native Ollama request with the redacted prompt (stubbed fetch, no network)", async () => {
    process.env.LAYA_BASE_URL = "http://localhost:11434";
    delete process.env.LAYA_MODEL;
    const spy = vi.fn(async () => ({ ok: true, json: async () => ollamaEnvelope(flatAnswers()) }) as unknown as Response);
    vi.stubGlobal("fetch", spy);
    const result = await callLaya("pay Rahul 500, call 9876543210");
    expect(result?.probs.instruction_override).toBe(0.1);
    expect(result?.latency_ms).toBeGreaterThanOrEqual(0);
    const [url, init] = (spy.mock.calls[0] ?? []) as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/generate");
    const body = JSON.parse(String(init.body)) as {
      model: string;
      prompt: string;
      format: string;
      options: { temperature: number };
    };
    expect(body.model).toBe("qwen2.5:1.5b");
    expect(body.format).toBe("json");
    expect(body.options.temperature).toBe(0);
    expect(body.prompt).not.toContain("9876543210");
    expect(body.prompt).toContain("[PHONE]");
  });

  it("fails closed on non-200, garbage JSON, and timeout", async () => {
    process.env.LAYA_BASE_URL = "http://localhost:11434";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response));
    await expect(callLaya("hello", 50)).rejects.toBeInstanceOf(FirewallUnavailableError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ response: "no json here" }) }) as unknown as Response),
    );
    await expect(callLaya("hello", 50)).rejects.toBeInstanceOf(FirewallUnavailableError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: { signal?: AbortSignal }) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => resolve(), 200);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
        return { ok: true, json: async () => ollamaEnvelope(flatAnswers()) } as unknown as Response;
      }),
    );
    await expect(callLaya("hello", 20)).rejects.toBeInstanceOf(FirewallUnavailableError);
  });
});
