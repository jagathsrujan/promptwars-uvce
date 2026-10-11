import { describe, expect, it, vi } from "vitest";
import { listsForSurface, resolveListHits } from "./lists";

function supabaseWith(rows: Array<{ list: string; key_type: string; key_hash: string; expires_at: string | null }>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(async () => ({ data: rows, error: null })),
        })),
      })),
    })),
  } as unknown as Parameters<typeof resolveListHits>[0];
}

describe("resolveListHits", () => {
  it("returns empty when no keys are given (no query)", async () => {
    const supabase = supabaseWith([]);
    expect(await resolveListHits(supabase, "user-1", [])).toEqual({
      blocklisted: false,
      allowlisted: false,
      reviewlisted: false,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("block bypasses the model: a blocklist hit flags blocklisted", async () => {
    const supabase = supabaseWith([
      { list: "block", key_type: "acct_hash", key_hash: "a1b2c3d4e5f60718", expires_at: null },
    ]);
    const hits = await resolveListHits(supabase, "user-1", [
      { key_type: "acct_hash", key_hash: "a1b2c3d4e5f60718" },
    ]);
    expect(hits.blocklisted).toBe(true);
    expect(hits.allowlisted).toBe(false);
  });

  it("allow fast-approves: an allowlist hit flags allowlisted", async () => {
    const supabase = supabaseWith([
      { list: "allow", key_type: "device_hash", key_hash: "d1e2f3a4b5c60718", expires_at: null },
    ]);
    const hits = await resolveListHits(supabase, "user-1", [
      { key_type: "device_hash", key_hash: "d1e2f3a4b5c60718" },
    ]);
    expect(hits.allowlisted).toBe(true);
    expect(hits.blocklisted).toBe(false);
  });

  it("expired rows are ignored", async () => {
    const supabase = supabaseWith([
      { list: "block", key_type: "acct_hash", key_hash: "a1b2c3d4e5f60718", expires_at: new Date(Date.now() - 1000).toISOString() },
    ]);
    const hits = await resolveListHits(supabase, "user-1", [
      { key_type: "acct_hash", key_hash: "a1b2c3d4e5f60718" },
    ]);
    expect(hits).toEqual({ blocklisted: false, allowlisted: false, reviewlisted: false });
  });

  it("a lookup failure treats lists as absent (classifiers still run)", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({ data: null, error: { message: "db down" } })),
          })),
        })),
      })),
    } as unknown as Parameters<typeof resolveListHits>[0];
    const hits = await resolveListHits(supabase, "user-1", [
      { key_type: "acct_hash", key_hash: "a1b2c3d4e5f60718" },
    ]);
    expect(hits).toEqual({ blocklisted: false, allowlisted: false, reviewlisted: false });
  });
});

describe("listsForSurface", () => {
  const hits = { blocklisted: true, allowlisted: false, reviewlisted: false };
  it("exempts console runs", () => {
    expect(listsForSurface("console", hits)).toBeNull();
  });

  it("applies lists on chat/memo/confirm", () => {
    expect(listsForSurface("chat", hits)).toBe(hits);
    expect(listsForSurface("memo", hits)).toBe(hits);
    expect(listsForSurface("confirm", hits)).toBe(hits);
  });
});
