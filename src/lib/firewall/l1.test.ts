import { afterEach, describe, expect, it, vi } from "vitest";
import { callJev, FirewallUnavailableError, parseJevAnswers } from "./l1";

/* Helper: a well-formed jev answers payload (the shape parseJevAnswers reads). */

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    answers: {
      instruction_override: { type: "noul", noul: 0.1 },
      exfiltration: { type: "noul", noul: 0.2 },
      roleplay_hijack: { type: "noul", noul: 0.05 },
      social_pressure: { type: "noul", noul: 0.9 },
      request_clarity: {
        score: 1.6,
        probabilities: { "0": 0.03, "1": 0.3, "2": 0.67 },
      },
      ...overrides,
    },
  };
}

const ORIGINAL_DIRECT_KEY = process.env.DECISIONS_API_KEY;
const ORIGINAL_PROVIDER_KEY = process.env.COMMANDCODE_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_DIRECT_KEY === undefined) delete process.env.DECISIONS_API_KEY;
  else process.env.DECISIONS_API_KEY = ORIGINAL_DIRECT_KEY;
  if (ORIGINAL_PROVIDER_KEY === undefined) delete process.env.COMMANDCODE_API_KEY;
  else process.env.COMMANDCODE_API_KEY = ORIGINAL_PROVIDER_KEY;
});

function stubFetch(payload: unknown) {
  delete process.env.COMMANDCODE_API_KEY;
  process.env.DECISIONS_API_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => payload }) as unknown as Response),
  );
}

function stubProviderFetch(payload: unknown) {
  delete process.env.DECISIONS_API_KEY;
  process.env.COMMANDCODE_API_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => payload }) as unknown as Response),
  );
}

describe("parseJevAnswers — valid input", () => {
  it("parses every probability and the clarity distribution exactly", () => {
    const parsed = parseJevAnswers(validPayload());
    expect(parsed.instruction_override).toBe(0.1);
    expect(parsed.exfiltration).toBe(0.2);
    expect(parsed.roleplay_hijack).toBe(0.05);
    expect(parsed.social_pressure).toBe(0.9);
    expect(parsed.clarity).toEqual({ score: 1.6, unclear: 0.03, partial: 0.3, fully: 0.67 });
  });

  it("accepts boundary probabilities 0 and 1", () => {
    const parsed = parseJevAnswers(
      validPayload({
        instruction_override: { type: "noul", noul: 0 },
        exfiltration: { type: "noul", noul: 1 },
        roleplay_hijack: { type: "noul", noul: 0 },
        social_pressure: { type: "noul", noul: 1 },
      }),
    );
    expect(parsed.instruction_override).toBe(0);
    expect(parsed.exfiltration).toBe(1);
    expect(parsed.roleplay_hijack).toBe(0);
    expect(parsed.social_pressure).toBe(1);
  });

  it("defaults absent clarity distribution entries to 0", () => {
    const parsed = parseJevAnswers(
      validPayload({ request_clarity: { score: 2, probabilities: {} } }),
    );
    expect(parsed.clarity.score).toBe(2);
    expect(parsed.clarity.unclear).toBe(0);
    expect(parsed.clarity.partial).toBe(0);
    expect(parsed.clarity.fully).toBe(0);
  });
});

describe("parseJevAnswers — missing answers", () => {
  it("throws when the payload has no answers object", () => {
    expect(() => parseJevAnswers({})).toThrowError(FirewallUnavailableError);
    expect(() => parseJevAnswers(null)).toThrowError(FirewallUnavailableError);
    expect(() => parseJevAnswers({ answers: null })).toThrowError(FirewallUnavailableError);
    expect(() => parseJevAnswers({ answers: "yes" })).toThrowError(FirewallUnavailableError);
  });

  it("throws when a single noul answer is missing", () => {
    const { exfiltration: _dropped, ...rest } = (validPayload().answers ?? {}) as Record<
      string,
      unknown
    >;
    expect(() => parseJevAnswers({ answers: rest })).toThrowError(/exfiltration/);
  });

  it("throws when the clarity score is missing", () => {
    expect(() =>
      parseJevAnswers(validPayload({ request_clarity: { probabilities: { "0": 1 } } })),
    ).toThrowError(/clarity/i);
  });
});

describe("parseJevAnswers — out-of-range values", () => {
  it("rejects probabilities above 1", () => {
    expect(() =>
      parseJevAnswers(validPayload({ instruction_override: { type: "noul", noul: 1.5 } })),
    ).toThrowError(/instruction_override/);
  });

  it("rejects negative probabilities", () => {
    expect(() =>
      parseJevAnswers(validPayload({ social_pressure: { type: "noul", noul: -0.2 } })),
    ).toThrowError(/social_pressure/);
  });

  it("rejects non-numeric probabilities", () => {
    for (const bad of ["high", undefined, Number.NaN]) {
      expect(() =>
        parseJevAnswers(validPayload({ exfiltration: { type: "noul", noul: bad } })),
      ).toThrowError(/exfiltration/);
    }
  });

  it("rejects a negative clarity score", () => {
    expect(() =>
      parseJevAnswers(validPayload({ request_clarity: { score: -1, probabilities: {} } })),
    ).toThrowError(/clarity/i);
  });

  it("reports every failure as a jev FirewallUnavailableError", () => {
    try {
      parseJevAnswers({});
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FirewallUnavailableError);
      expect((error as FirewallUnavailableError).layer).toBe("jev");
    }
  });
});

describe("parseJevAnswers — doubly-wrapped envelope", () => {
  it("parses the inner payload once the envelope is unwrapped (callJev's unwrap step)", () => {
    // callJev tolerates { answers: { answers } } by unwrapping to the inner
    // object before calling parseJevAnswers; the inner payload itself parses.
    const inner = validPayload();
    const doublyWrapped = { answers: { answers: inner.answers } };
    const unwrapped = (doublyWrapped.answers as { answers: unknown }).answers;
    expect(parseJevAnswers({ answers: unwrapped })).toEqual(parseJevAnswers(inner));
  });

  it("callJev unwraps a doubly-wrapped envelope end to end (stubbed fetch, no network)", async () => {
    const inner = validPayload();
    stubFetch({ code: 0, message: "ok", data: { result: { answers: { answers: inner.answers } } } });
    const parsed = await callJev("transfer 500 to 1001");
    expect(parsed).toEqual(parseJevAnswers(inner));
  });

  it("callJev still parses a single-wrapped result (stubbed fetch, no network)", async () => {
    const inner = validPayload();
    stubFetch({ code: 0, message: "ok", data: { result: inner } });
    const parsed = await callJev("transfer 500 to 1001");
    expect(parsed.social_pressure).toBe(0.9);
    expect(parsed.clarity.score).toBe(1.6);
  });

  it("callJev prefers the provider path when its key exists (stubbed fetch, no network)", async () => {
    const inner = validPayload();
    stubProviderFetch(inner);
    const spy = fetch as unknown as ReturnType<typeof vi.fn>;
    const parsed = await callJev("what is my balance?");
    expect(parsed.instruction_override).toBe(0.1);
    const url = String(spy.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/provider/v1/systemone");
  });

  it("callJev fails closed when neither key is configured", async () => {
    delete process.env.COMMANDCODE_API_KEY;
    delete process.env.DECISIONS_API_KEY;
    await expect(callJev("transfer 500 to 1001")).rejects.toBeInstanceOf(FirewallUnavailableError);
  });
});
