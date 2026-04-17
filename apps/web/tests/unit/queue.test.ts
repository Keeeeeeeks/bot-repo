// apps/web/tests/unit/queue.test.ts
import { describe, it, expect, vi } from "vitest";
import { enqueueScan, getJobStatus } from "@/lib/queue";

vi.mock("@upstash/redis", () => {
  const store = new Map<string, unknown>();
  return {
    Redis: class {
      async set(k: string, v: unknown) { store.set(k, v); return "OK"; }
      async get(k: string) { return store.get(k) ?? null; }
      async lpush(_k: string, _v: string) { return 1; }
      async publish(_c: string, _m: string) { return 1; }
    },
  };
});

describe("queue", () => {
  it("enqueueScan returns a job id", async () => {
    const { jobId } = await enqueueScan({ owner: "a", name: "b" }, null);
    expect(jobId).toMatch(/^scan_[a-f0-9-]+$/);
  });
  it("getJobStatus returns null when absent", async () => {
    expect(await getJobStatus("missing")).toBeNull();
  });
});
