import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "@/lib/admin-auth";

describe("admin-auth", () => {
  it("round-trips a token", () => {
    const t = signToken("admin@tcabr.example", "secret-abc", 60_000);
    const r = verifyToken(t, "secret-abc");
    expect(r.email).toBe("admin@tcabr.example");
  });
  it("rejects tampered token", () => {
    const t = signToken("x@y.z", "secret", 60_000);
    expect(() => verifyToken(t + "x", "secret")).toThrow();
  });
  it("rejects expired token", () => {
    const t = signToken("x@y.z", "secret", -1);
    expect(() => verifyToken(t, "secret")).toThrow(/expired/i);
  });
});
