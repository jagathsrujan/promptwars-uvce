import { describe, expect, it } from "vitest";
import { FirewallUnavailableError } from "./l1";
import { extractJson, parseL2Response } from "./l2";

function validVerdict(overrides: Record<string, unknown> = {}) {
  return {
    status: "APPROVED",
    risk_score: 12,
    threat_category: "NONE",
    explanation: "Legitimate transfer request.",
    sanitized_intent: { intent: "TRANSFER", summary: "transfer 500 to 1001" },
    ...overrides,
  };
}

describe("extractJson — fenced JSON", () => {
  it("parses a plain JSON object", () => {
    const raw = JSON.stringify(validVerdict());
    expect(extractJson(raw)).toEqual(validVerdict());
  });

  it("tolerates ```json fences", () => {
    const raw = "```json\n" + JSON.stringify(validVerdict()) + "\n```";
    expect(extractJson(raw)).toEqual(validVerdict());
  });

  it("tolerates bare ``` fences and surrounding prose", () => {
    const raw = "Here is my verdict:\n```\n" + JSON.stringify(validVerdict()) + "\n```";
    expect(extractJson(raw)).toEqual(validVerdict());
  });

  it("extracts the first JSON object from surrounding text", () => {
    const raw = "analysis complete: " + JSON.stringify(validVerdict()) + " done.";
    expect(extractJson(raw)).toEqual(validVerdict());
  });
});

describe("extractJson — garbage", () => {
  it("throws a fail-closed l2 error when there is no JSON object", () => {
    for (const garbage of ["", "   ", "no braces here", "APPROVED with no object"]) {
      try {
        extractJson(garbage);
        expect.unreachable(`should have thrown for ${JSON.stringify(garbage)}`);
      } catch (error) {
        expect(error).toBeInstanceOf(FirewallUnavailableError);
        expect((error as FirewallUnavailableError).layer).toBe("l2");
      }
    }
  });

  it("throws when braces hold invalid JSON", () => {
    try {
      extractJson("{ not valid json }");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FirewallUnavailableError);
      expect((error as FirewallUnavailableError).layer).toBe("l2");
    }
  });
});

describe("parseL2Response — valid and bad schema", () => {
  it("parses a fenced valid verdict end to end", () => {
    const raw = "```json\n" + JSON.stringify(validVerdict()) + "\n```";
    const parsed = parseL2Response(raw);
    expect(parsed.status).toBe("APPROVED");
    expect(parsed.risk_score).toBe(12);
    expect(parsed.threat_category).toBe("NONE");
    expect(parsed.explanation).toBe("Legitimate transfer request.");
    expect(parsed.sanitized_intent).toEqual({ intent: "TRANSFER", summary: "transfer 500 to 1001" });
  });

  it("clamps and rounds the risk score into 0-100", () => {
    const high = parseL2Response(JSON.stringify(validVerdict({ risk_score: 250.4 })));
    expect(high.risk_score).toBe(100);
    const low = parseL2Response(JSON.stringify(validVerdict({ risk_score: -5 })));
    expect(low.risk_score).toBe(0);
  });

  it("falls back to PROMPT_INJECTION for an unknown threat category", () => {
    const parsed = parseL2Response(JSON.stringify(validVerdict({ threat_category: "SOMETHING_NEW" })));
    expect(parsed.threat_category).toBe("PROMPT_INJECTION");
  });

  it("rejects a missing status", () => {
    const { status: _dropped, ...rest } = validVerdict();
    expect(() => parseL2Response(JSON.stringify(rest))).toThrowError(FirewallUnavailableError);
  });

  it("rejects an empty explanation", () => {
    expect(() => parseL2Response(JSON.stringify(validVerdict({ explanation: "" })))).toThrowError(
      FirewallUnavailableError,
    );
  });

  it("rejects a non-numeric risk score", () => {
    expect(() =>
      parseL2Response(JSON.stringify(validVerdict({ risk_score: "high" }))),
    ).toThrowError(FirewallUnavailableError);
  });

  it("rejects garbage with no JSON object", () => {
    expect(() => parseL2Response("the model said nothing structured")).toThrowError(
      FirewallUnavailableError,
    );
  });

  it("reports schema mismatches as l2 FirewallUnavailableError", () => {
    try {
      parseL2Response(JSON.stringify({ status: "MAYBE" }));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FirewallUnavailableError);
      expect((error as FirewallUnavailableError).layer).toBe("l2");
    }
  });
});
