import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function clearClientEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

afterEach(() => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  vi.doUnmock("@upstash/redis");
});

describe("environment-backed clients", () => {
  it("imports the Supabase module without build-time env vars", async () => {
    clearClientEnv();

    await expect(import("@/lib/supabase")).resolves.toHaveProperty("supabaseService");
  });

  it("throws a clear runtime error when Supabase service env vars are missing", async () => {
    clearClientEnv();
    const { supabaseService } = await import("@/lib/supabase");

    expect(() => supabaseService()).toThrow("NEXT_PUBLIC_SUPABASE_URL missing");
  });

  it("imports the queue module without build-time Redis env vars", async () => {
    clearClientEnv();
    vi.doMock("@upstash/redis", () => ({
      Redis: class {
        constructor(options: { url?: string; token?: string }) {
          if (!options.url || !options.token) throw new Error("missing upstash env");
        }
      },
    }));

    await expect(import("@/lib/queue")).resolves.toHaveProperty("enqueueScan");
  });
});
