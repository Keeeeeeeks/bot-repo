// apps/web/tests/unit/queue.test.ts
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
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
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;

    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  });

  it("enqueueScan returns a job id", async () => {
    const { jobId } = await enqueueScan({ owner: "a", name: "b" }, null);
    expect(jobId).toMatch(/^scan_[a-f0-9-]+$/);
  });
  it("getJobStatus returns null when absent", async () => {
    expect(await getJobStatus("missing")).toBeNull();
  });
});
