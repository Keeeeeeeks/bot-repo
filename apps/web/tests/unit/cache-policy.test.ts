// apps/web/tests/unit/cache-policy.test.ts
import { describe, it, expect } from "vitest";
import { cacheFreshnessMs, isSnapshotFresh } from "@/lib/cache-policy";

describe("cache-policy", () => {
  it("free tier is 24 hours", () => {
    expect(cacheFreshnessMs("free")).toBe(24 * 60 * 60 * 1000);
  });
  it("pro tier is 0 (always on-demand)", () => {
    expect(cacheFreshnessMs("pro")).toBe(0);
  });
  it("isSnapshotFresh respects tier", () => {
    const now = new Date("2026-04-16T12:00:00Z").getTime();
    const tenHoursAgo = new Date("2026-04-16T02:00:00Z");
    const thirtyHoursAgo = new Date("2026-04-15T06:00:00Z");
    expect(isSnapshotFresh(tenHoursAgo, "free", now)).toBe(true);
    expect(isSnapshotFresh(thirtyHoursAgo, "free", now)).toBe(false);
    expect(isSnapshotFresh(tenHoursAgo, "pro", now)).toBe(false); // pro always stale
  });
});
