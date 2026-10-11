import { describe, expect, it } from "vitest";
import {
  emptyVelocity,
  hmacToken,
  ipPrefix,
  postalPrefix,
  redactMemo,
  tokeniseForJev,
  tokenisedLeaksRaw,
} from "./tokenise";

const SALT = "test-daily-salt";

describe("hmacToken", () => {
  it("is stable per salt and differs across salts", () => {
    expect(hmacToken(SALT, "acct:50123456789")).toBe(hmacToken(SALT, "acct:50123456789"));
    expect(hmacToken(SALT, "acct:50123456789")).not.toBe(hmacToken("other-salt", "acct:50123456789"));
    expect(hmacToken(SALT, "acct:50123456789")).toHaveLength(16);
  });

  it("differs across namespaces (acct vs phone for the same digits)", () => {
    expect(hmacToken(SALT, "acct:50123456789")).not.toBe(hmacToken(SALT, "phone:50123456789"));
  });
});

describe("redactMemo", () => {
  it("redacts emails, phones and long digit runs", () => {
    const memo = "Pay Rahul 500, call 9876543210 or aarav@example.com, acct 50123456789";
    const redacted = redactMemo(memo);
    expect(redacted).not.toContain("9876543210");
    expect(redacted).not.toContain("aarav@example.com");
    expect(redacted).not.toContain("50123456789");
    expect(redacted).toContain("[PHONE]");
    expect(redacted).toContain("[PERSON]");
    expect(redacted).toContain("[ACCT]");
  });

  it("keeps short benign memos intact", () => {
    expect(redactMemo("Rent — October")).toBe("Rent — October");
    expect(redactMemo("Dinner split — thanks!")).toBe("Dinner split — thanks!");
  });

  it("caps long memos head+tail with a truncation marker", () => {
    const long = `note ${"x".repeat(600)} attack-tail-marker`;
    const redacted = redactMemo(long);
    expect(redacted).toContain("[truncated]");
    expect(redacted).toContain("attack-tail-marker");
    expect(redacted.length).toBeLessThan(long.length);
  });
});

describe("ipPrefix / postalPrefix", () => {
  it("buckets IPv4 to /24 and rejects non-IPv4", () => {
    expect(ipPrefix("49.248.12.34")).toBe("49.248.12.0/24");
    expect(ipPrefix(null)).toBeNull();
    expect(ipPrefix("not-an-ip")).toBeNull();
  });

  it("keeps only the postal prefix", () => {
    expect(postalPrefix("560034")).toBe("560");
    expect(postalPrefix("56")).toBeNull();
    expect(postalPrefix(null)).toBeNull();
  });
});

describe("tokeniseForJev", () => {
  function base() {
    return {
      salt: SALT,
      accountNumber: "50123456789",
      counterpartyAccount: "50300006104",
      deviceId: "device-abc-123",
      email: "Aarav@Example.com",
      phone: "+91 98765 43210",
      ip: "49.248.12.34",
      asnBucket: "as45609",
      cityCode: "BLR",
      postalCode: "560034",
      addrMismatch: false,
      binTier: "visa_classic",
      pan: "4111111111111234",
      amountInr: 500,
      hourBucket: "2026-10-11T14",
      velocity: { ...emptyVelocity(), count_24h: 3, sum_24h: 1500 },
      memo: "Dinner with Rahul, call 9876543210",
    };
  }

  it("emits hashes + last4 and drops every raw identifier", () => {
    const bundle = tokeniseForJev(base());
    expect(bundle.acct_hash).toHaveLength(16);
    expect(bundle.acct_last4).toBe("6789");
    expect(bundle.counterparty_hash).toHaveLength(16);
    expect(bundle.device_hash).toHaveLength(16);
    expect(bundle.email_hash).toHaveLength(16);
    expect(bundle.phone_hash).toHaveLength(16);
    expect(bundle.ip_prefix).toBe("49.248.12.0/24");
    expect(bundle.postal_prefix).toBe("560");
    expect(bundle.pan_last4).toBe("1234");
    expect(bundle.amount_inr).toBe(500);
    expect(bundle.hour_bucket).toBe("2026-10-11T14");
    const leaks = tokenisedLeaksRaw(bundle, [
      "50123456789",
      "50300006104",
      "device-abc-123",
      "Aarav@Example.com",
      "aarav@example.com",
      "+91 98765 43210",
      "9876543210",
      "49.248.12.34",
      "560034",
      "4111111111111234",
    ]);
    expect(leaks).toEqual([]);
  });

  it("nulls optional fields when absent and keeps only aggregates", () => {
    const bundle = tokeniseForJev({
      salt: SALT,
      accountNumber: "50123456789",
      memo: "Rent — October",
    });
    expect(bundle.counterparty_hash).toBeNull();
    expect(bundle.device_hash).toBeNull();
    expect(bundle.email_hash).toBeNull();
    expect(bundle.phone_hash).toBeNull();
    expect(bundle.ip_prefix).toBeNull();
    expect(bundle.pan_last4).toBeNull();
    expect(bundle.amount_inr).toBeNull();
    expect(bundle.velocity_features).toBeNull();
    expect(bundle.redacted_memo).toBe("Rent — October");
  });

  it("email hashing is case-insensitive, phone hashing digit-normalized", () => {
    const a = tokeniseForJev({ salt: SALT, accountNumber: "50123456789", email: "A@x.com", memo: "m" });
    const b = tokeniseForJev({ salt: SALT, accountNumber: "50123456789", email: "a@X.COM", memo: "m" });
    expect(a.email_hash).toBe(b.email_hash);
    const c = tokeniseForJev({ salt: SALT, accountNumber: "50123456789", phone: "+91 98765 43210", memo: "m" });
    const d = tokeniseForJev({ salt: SALT, accountNumber: "50123456789", phone: "9876543210", memo: "m" });
    expect(c.phone_hash).toBe(d.phone_hash);
  });
});
