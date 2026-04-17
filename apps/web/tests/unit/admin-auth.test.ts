import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { adminAllowList, isAdmin, signToken, verifyToken } from "@/lib/admin-auth";

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

describe("admin-auth allowlist", () => {
  const ORIGINAL = process.env.ADMIN_EMAIL_ALLOWLIST;
  beforeEach(() => {
    delete process.env.ADMIN_EMAIL_ALLOWLIST;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ADMIN_EMAIL_ALLOWLIST;
    else process.env.ADMIN_EMAIL_ALLOWLIST = ORIGINAL;
  });

  it("returns empty list when env var unset", () => {
    expect(adminAllowList()).toEqual([]);
  });
  it("parses comma-separated emails, trims whitespace, and lowercases", () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = " Admin@TCABR.example , root@tcabr.example ";
    expect(adminAllowList()).toEqual(["admin@tcabr.example", "root@tcabr.example"]);
  });
  it("ignores empty entries in the list", () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = "admin@tcabr.example,,  ,root@tcabr.example";
    expect(adminAllowList()).toEqual(["admin@tcabr.example", "root@tcabr.example"]);
  });
  it("isAdmin returns false when allowlist is empty", () => {
    expect(isAdmin("admin@tcabr.example")).toBe(false);
  });
  it("isAdmin returns false for email not in allowlist", () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = "admin@tcabr.example";
    expect(isAdmin("attacker@evil.example")).toBe(false);
  });
  it("isAdmin returns true for exact match", () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = "admin@tcabr.example";
    expect(isAdmin("admin@tcabr.example")).toBe(true);
  });
  it("isAdmin is case-insensitive on both sides", () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = "Admin@TCABR.example";
    expect(isAdmin("ADMIN@tcabr.EXAMPLE")).toBe(true);
  });
});
