# TCABR Plan 3 — Web App Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every public page, API route, and component needed to accept a repo URL, enqueue a scan, render a report, and browse a leaderboard — without paywall gating (which lands in Plan 4). All users implicitly get the "Free" tier UX during this plan: **24-hour cache freshness by default** (spec advisory #1).

**Architecture:** Next.js 15 App Router. Route handlers in `/app/api/*/route.ts` enqueue jobs to Upstash Redis (the same queue `arq` listens on) and poll job status via `scan:status:{job_id}` keys. Pages read from Supabase Postgres directly via the service-role client (safe because all read data is already public + per-snapshot aggregates). Recharts for time-series. A `cache-policy.ts` helper encapsulates the per-tier freshness logic so Plan 4 can drop in Pro behavior by flipping one flag.

**Tech Stack:** Next.js 15, React 19, Server Components + Route Handlers, Tailwind, shadcn/ui primitives (button, input, card, tabs), Recharts, zod, @supabase/supabase-js, @upstash/redis, vitest + @testing-library/react, Playwright for smoke.

---

## File Structure

New files under `apps/web/` created by this plan:

```
app/
  page.tsx                                   # replace scaffold landing
  r/
    [owner]/
      [name]/
        page.tsx                              # report page (server component)
        loading.tsx
        not-found.tsx
  leaderboard/page.tsx
  about/page.tsx
  terms/page.tsx
  privacy/page.tsx
  removal/page.tsx                            # (stub; real form lands in Plan 5)
  api/
    scan/
      route.ts                                # POST: enqueue
      [jobId]/
        route.ts                              # GET: poll
    leaderboard/
      route.ts                                # GET: top N each side
    repo/
      [owner]/
        [name]/
          route.ts                            # GET: latest snapshot JSON
components/
  SearchForm.tsx
  ScoreHero.tsx
  FeatureBreakdown.tsx
  StarTimeSeries.tsx
  StargazerGallery.tsx
  ObscuredUsername.tsx                        # default-blur component (reveal wired in Plan 4)
  LeaderboardTable.tsx
  DisclaimerBanner.tsx
  SiteFooter.tsx
  SiteHeader.tsx
lib/
  cache-policy.ts                             # per-tier freshness (advisory #1)
  queue.ts                                    # wraps @upstash/redis for job ops
  repo-ref.ts                                 # parse "owner/name" or URL
  snapshots.ts                                # DB access for latest snapshot / leaderboard
tests/
  unit/
    cache-policy.test.ts
    repo-ref.test.ts
    queue.test.ts
  component/
    SearchForm.test.tsx
    ObscuredUsername.test.tsx
    LeaderboardTable.test.tsx
  e2e/
    smoke.spec.ts
playwright.config.ts
vitest.config.ts
```

---

## Task 1: vitest + testing-library + playwright setup

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/tests/unit/.gitkeep`

- [ ] **Step 1: Add deps**

```bash
cd apps/web
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @playwright/test
```

- [ ] **Step 2: Write `apps/web/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/component/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": new URL("./", import.meta.url).pathname },
  },
});
```

- [ ] **Step 3: Write `apps/web/tests/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Write `apps/web/playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: { baseURL: "http://localhost:3000" },
});
```

- [ ] **Step 5: Update `apps/web/package.json` scripts**

Add under `"scripts"`:

```json
"test:unit": "vitest run",
"test:e2e": "playwright test"
```

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add apps/web/
git commit -m "chore(web): set up vitest + RTL + playwright"
```

---

## Task 2: repo-ref parser

**Files:**
- Create: `apps/web/lib/repo-ref.ts`
- Test: `apps/web/tests/unit/repo-ref.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/web/tests/unit/repo-ref.test.ts
import { describe, it, expect } from "vitest";
import { parseRepoRef, RepoRefError } from "@/lib/repo-ref";

describe("parseRepoRef", () => {
  it("parses owner/name", () => {
    expect(parseRepoRef("vercel/next.js")).toEqual({ owner: "vercel", name: "next.js" });
  });
  it("parses https://github.com/owner/name", () => {
    expect(parseRepoRef("https://github.com/vercel/next.js")).toEqual({
      owner: "vercel", name: "next.js",
    });
  });
  it("strips trailing /stargazers or .git", () => {
    expect(parseRepoRef("https://github.com/vercel/next.js/stargazers")).toEqual({
      owner: "vercel", name: "next.js",
    });
    expect(parseRepoRef("git@github.com:vercel/next.js.git")).toEqual({
      owner: "vercel", name: "next.js",
    });
  });
  it("throws on junk", () => {
    expect(() => parseRepoRef("not a repo")).toThrow(RepoRefError);
    expect(() => parseRepoRef("https://gitlab.com/a/b")).toThrow(RepoRefError);
  });
});
```

- [ ] **Step 2: Write `apps/web/lib/repo-ref.ts`**

```typescript
import { RepoRefSchema, type RepoRef } from "@tcabr/shared";

export class RepoRefError extends Error {}

export function parseRepoRef(input: string): RepoRef {
  const trimmed = input.trim();
  if (!trimmed) throw new RepoRefError("empty input");

  // SSH form: git@github.com:owner/name.git
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (ssh) return RepoRefSchema.parse({ owner: ssh[1], name: ssh[2] });

  let pathPart = trimmed;
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/(.+)$/i);
  if (urlMatch) pathPart = urlMatch[1]!;
  else if (/^https?:\/\//i.test(trimmed)) {
    throw new RepoRefError("only github.com URLs are supported");
  }

  pathPart = pathPart.replace(/\.git$/i, "").replace(/\/+$/, "");
  const [owner, name, ...rest] = pathPart.split("/");
  if (!owner || !name) throw new RepoRefError("expected owner/name");
  // Trailing segments like /stargazers are allowed and ignored.
  void rest;
  try {
    return RepoRefSchema.parse({ owner, name });
  } catch {
    throw new RepoRefError("invalid repo reference");
  }
}
```

- [ ] **Step 3: Run test**

```bash
cd apps/web && pnpm test:unit repo-ref && cd ../..
```

Expected: 4 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/repo-ref.ts apps/web/tests/unit/repo-ref.test.ts
git commit -m "feat(web): parse owner/name from URLs, SSH, and slashed input"
```

---

## Task 3: Cache-policy helper (advisory #1)

**Files:**
- Create: `apps/web/lib/cache-policy.ts`
- Test: `apps/web/tests/unit/cache-policy.test.ts`

Implements spec advisory #1: explicit per-tier cache freshness. Free = 24h; Pro = 0 (always on-demand) — but Plan 3 ships with `tier: "free"` for everyone since auth is Plan 4.

- [ ] **Step 1: Write failing test**

```typescript
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
```

- [ ] **Step 2: Write `apps/web/lib/cache-policy.ts`**

```typescript
import type { SubscriptionTier } from "@tcabr/shared";

const HOUR = 60 * 60 * 1000;

export function cacheFreshnessMs(tier: SubscriptionTier): number {
  switch (tier) {
    case "free":
      return 24 * HOUR;
    case "pro":
      return 0; // on-demand: any existing snapshot is "stale" for Pro, triggering re-scan
    case "team":
      return 0;
  }
}

export function isSnapshotFresh(
  createdAt: Date,
  tier: SubscriptionTier,
  now: number = Date.now(),
): boolean {
  const ttl = cacheFreshnessMs(tier);
  if (ttl === 0) return false;
  return now - createdAt.getTime() <= ttl;
}
```

- [ ] **Step 3: Run test and commit**

```bash
cd apps/web && pnpm test:unit cache-policy && cd ../..
git add apps/web/lib/cache-policy.ts apps/web/tests/unit/cache-policy.test.ts
git commit -m "feat(web): per-tier cache freshness (free=24h, pro=on-demand)"
```

---

## Task 4: Queue helper (wraps @upstash/redis for arq interop)

**Files:**
- Create: `apps/web/lib/queue.ts`
- Test: `apps/web/tests/unit/queue.test.ts`

arq uses its own job-id serialization scheme; for simplicity we enqueue via a small compatible payload and poll using a status key the worker writes back (requires a Plan 2 follow-up: `after_job_end` hook). If you prefer to avoid that, use `arq_default:` stream keys directly. Here we use a lightweight convention keyed on `tcabr:scan:status:{job_id}` which the worker can set in a post-hook. For MVP we accept this coupling and document it.

- [ ] **Step 1: Write failing test using a mocked Redis**

```typescript
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
```

- [ ] **Step 2: Write `apps/web/lib/queue.ts`**

```typescript
import { randomUUID } from "crypto";
import { redis, jobStatusKey } from "./redis";

export interface JobStatus {
  state: "queued" | "running" | "done" | "error";
  snapshot_id?: string;
  error?: string;
  updated_at: string;
}

const ARQ_QUEUE = "arq:queue";

export async function enqueueScan(
  repo: { owner: string; name: string },
  userToken: string | null,
): Promise<{ jobId: string }> {
  const jobId = `scan_${randomUUID()}`;
  // Minimal arq-compatible payload. The worker's `scan_repo(ctx, owner, name, user_token)` signature
  // consumes positional args from `pickle`-serialized list. To avoid a pickle dependency in Node,
  // we push a JSON envelope onto a companion queue that an adapter pops and re-enqueues via the Python
  // arq client. For MVP we use that adapter approach; see `apps/worker/src/tcabr_worker/bridge.py`.
  await redis.lpush("tcabr:scan:requests", JSON.stringify({
    job_id: jobId,
    owner: repo.owner,
    name: repo.name,
    user_token: userToken,
    enqueued_at: new Date().toISOString(),
  }));
  await redis.set(jobStatusKey(jobId), JSON.stringify({
    state: "queued",
    updated_at: new Date().toISOString(),
  } satisfies JobStatus), { ex: 60 * 60 }); // 1h expiry
  return { jobId };
}

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const raw = await redis.get<string | JobStatus>(jobStatusKey(jobId));
  if (!raw) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as JobStatus) : raw;
}

// Silence unused-import lint
void ARQ_QUEUE;
```

- [ ] **Step 3: Add the Python-side bridge consumer. Create `apps/worker/src/tcabr_worker/bridge.py`**

```python
"""Bridge: drains tcabr:scan:requests (pushed by Next.js) into arq.enqueue_job.

Runs as a sidecar coroutine on worker startup so Next.js can use a simple JSON
envelope instead of pickle-serializing arq messages in Node.
"""
from __future__ import annotations

import asyncio
import json

import structlog
from arq.connections import ArqRedis, create_pool, RedisSettings
from redis.asyncio import Redis

from .config import settings

log = structlog.get_logger()

REQUEST_QUEUE = "tcabr:scan:requests"
STATUS_KEY_PREFIX = "tcabr:scan:status:"


async def run_bridge() -> None:
    arq: ArqRedis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    raw: Redis = Redis.from_url(settings.redis_url, decode_responses=True)
    log.info("bridge.started")
    while True:
        popped = await raw.brpop(REQUEST_QUEUE, timeout=5)
        if popped is None:
            continue
        _, payload = popped
        env = json.loads(payload)
        job_id = env["job_id"]
        await raw.set(
            f"{STATUS_KEY_PREFIX}{job_id}",
            json.dumps({"state": "running", "updated_at": _now()}),
            ex=60 * 60,
        )
        try:
            job = await arq.enqueue_job(
                "scan_repo", env["owner"], env["name"], env.get("user_token")
            )
            assert job is not None
            result = await job.result(timeout=60 * 30)
            await raw.set(
                f"{STATUS_KEY_PREFIX}{job_id}",
                json.dumps({
                    "state": "done",
                    "snapshot_id": result["snapshot_id"],
                    "updated_at": _now(),
                }),
                ex=60 * 60 * 24,
            )
        except Exception as exc:  # noqa: BLE001
            log.exception("bridge.job_failed", err=str(exc))
            await raw.set(
                f"{STATUS_KEY_PREFIX}{job_id}",
                json.dumps({"state": "error", "error": str(exc), "updated_at": _now()}),
                ex=60 * 60,
            )


def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    asyncio.run(run_bridge())
```

- [ ] **Step 4: Document in worker README section**

Add a note to root `README.md` under "Local dev":

```markdown
    # Start the bridge alongside the worker so Next.js can enqueue scans:
    cd apps/worker && .venv/bin/python -m tcabr_worker.bridge &
```

- [ ] **Step 5: Run tests, commit**

```bash
cd apps/web && pnpm test:unit queue && cd ../..
git add apps/web/lib/queue.ts apps/web/tests/unit/queue.test.ts apps/worker/src/tcabr_worker/bridge.py README.md
git commit -m "feat: Next.js<->arq bridge for JSON-enqueue scan jobs"
```

---

## Task 5: Snapshots DB accessor

**Files:**
- Create: `apps/web/lib/snapshots.ts`

- [ ] **Step 1: Write `apps/web/lib/snapshots.ts`**

```typescript
import { supabaseService } from "./supabase";

export interface LatestSnapshot {
  repo_id: string;
  owner: string;
  name: string;
  star_count: number;
  anomaly_score: number;
  score_ci_low: number;
  score_ci_high: number;
  sample_size: number;
  stargazer_total: number;
  feature_breakdown: Record<string, number>;
  star_timeseries: { date: string; n: number }[];
  created_at: string;
}

export async function fetchLatestSnapshot(
  owner: string,
  name: string,
): Promise<LatestSnapshot | null> {
  const db = supabaseService();
  const { data: repo } = await db
    .from("repo")
    .select("id, owner, name, star_count")
    .eq("owner", owner)
    .eq("name", name)
    .maybeSingle();
  if (!repo) return null;

  const { data: snap } = await db
    .from("repo_snapshot")
    .select("anomaly_score, score_ci_low, score_ci_high, sample_size, stargazer_total, feature_breakdown, star_timeseries, created_at")
    .eq("repo_id", repo.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!snap) return null;

  return {
    repo_id: repo.id,
    owner: repo.owner,
    name: repo.name,
    star_count: repo.star_count,
    anomaly_score: snap.anomaly_score,
    score_ci_low: snap.score_ci_low,
    score_ci_high: snap.score_ci_high,
    sample_size: snap.sample_size,
    stargazer_total: snap.stargazer_total,
    feature_breakdown: snap.feature_breakdown as Record<string, number>,
    star_timeseries: snap.star_timeseries as { date: string; n: number }[],
    created_at: snap.created_at,
  };
}

export async function fetchLeaderboard(
  side: "suspicious" | "clean",
  limit: number = 25,
): Promise<LatestSnapshot[]> {
  const db = supabaseService();
  const orderCol = "anomaly_score";
  const ascending = side === "clean";
  const { data } = await db
    .from("repo_current_score")
    .select("repo_id, owner, name, star_count, anomaly_score, score_ci_low, score_ci_high, sample_size, stargazer_total, snapshot_created_at")
    .gte("star_count", 50)
    .order(orderCol, { ascending })
    .limit(limit);

  return (data ?? []).map((r) => ({
    repo_id: r.repo_id,
    owner: r.owner,
    name: r.name,
    star_count: r.star_count,
    anomaly_score: r.anomaly_score,
    score_ci_low: r.score_ci_low,
    score_ci_high: r.score_ci_high,
    sample_size: r.sample_size,
    stargazer_total: r.stargazer_total,
    feature_breakdown: {},
    star_timeseries: [],
    created_at: r.snapshot_created_at,
  }));
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck && cd ../..
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/snapshots.ts
git commit -m "feat(web): snapshot + leaderboard DB accessors"
```

---

## Task 6: API route POST /api/scan

**Files:**
- Create: `apps/web/app/api/scan/route.ts`

- [ ] **Step 1: Write `apps/web/app/api/scan/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseRepoRef, RepoRefError } from "@/lib/repo-ref";
import { isSnapshotFresh } from "@/lib/cache-policy";
import { fetchLatestSnapshot } from "@/lib/snapshots";
import { enqueueScan } from "@/lib/queue";

export const runtime = "nodejs";

const Body = z.object({ input: z.string().min(1).max(500) });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  let repo;
  try {
    repo = parseRepoRef(parsed.data.input);
  } catch (e) {
    const msg = e instanceof RepoRefError ? e.message : "invalid input";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // For Plan 3 everyone is treated as free tier (auth lands in Plan 4).
  const tier = "free" as const;
  const existing = await fetchLatestSnapshot(repo.owner, repo.name);
  if (existing && isSnapshotFresh(new Date(existing.created_at), tier)) {
    return NextResponse.json({
      cached: true,
      report_url: `/r/${repo.owner}/${repo.name}`,
      created_at: existing.created_at,
    });
  }

  const { jobId } = await enqueueScan(repo, null);
  return NextResponse.json({
    cached: false,
    job_id: jobId,
    poll_url: `/api/scan/${jobId}`,
    report_url: `/r/${repo.owner}/${repo.name}`,
  });
}
```

- [ ] **Step 2: Smoke test with curl (requires bridge running)**

```bash
curl -s -X POST http://localhost:3000/api/scan \
  -H 'content-type: application/json' \
  -d '{"input":"octocat/hello-world"}' | jq .
```

Expected: either `{ "cached": true, ... }` or `{ "job_id": "scan_...", ... }`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/scan/route.ts
git commit -m "feat(web): POST /api/scan enqueues or returns cached report URL"
```

---

## Task 7: API route GET /api/scan/[jobId]

**Files:**
- Create: `apps/web/app/api/scan/[jobId]/route.ts`

- [ ] **Step 1: Write the handler**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getJobStatus } from "@/lib/queue";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  if (!/^scan_[a-f0-9-]+$/.test(jobId)) {
    return NextResponse.json({ error: "invalid job id" }, { status: 400 });
  }
  const status = await getJobStatus(jobId);
  if (!status) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  return NextResponse.json(status);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/scan/
git commit -m "feat(web): GET /api/scan/[jobId] polls job status"
```

---

## Task 8: API routes GET /api/repo and GET /api/leaderboard

**Files:**
- Create: `apps/web/app/api/repo/[owner]/[name]/route.ts`
- Create: `apps/web/app/api/leaderboard/route.ts`

- [ ] **Step 1: Write `apps/web/app/api/repo/[owner]/[name]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { fetchLatestSnapshot } from "@/lib/snapshots";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;
  const snap = await fetchLatestSnapshot(owner, name);
  if (!snap) return NextResponse.json({ error: "not scanned yet" }, { status: 404 });
  return NextResponse.json(snap);
}
```

- [ ] **Step 2: Write `apps/web/app/api/leaderboard/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { fetchLeaderboard } from "@/lib/snapshots";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const side = url.searchParams.get("side") === "clean" ? "clean" : "suspicious";
  const rows = await fetchLeaderboard(side, 25);
  return NextResponse.json({ side, rows });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/repo/ apps/web/app/api/leaderboard/
git commit -m "feat(web): repo snapshot + leaderboard read APIs"
```

---

## Task 9: Site chrome — header, footer, disclaimer banner

**Files:**
- Create: `apps/web/components/SiteHeader.tsx`
- Create: `apps/web/components/SiteFooter.tsx`
- Create: `apps/web/components/DisclaimerBanner.tsx`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Write `apps/web/components/SiteHeader.tsx`**

```tsx
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold">
          <span aria-hidden>🫣</span> To Catch A Bot Repo
        </Link>
        <nav className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/about">About</Link>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Write `apps/web/components/SiteFooter.tsx`**

```tsx
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-neutral-200 py-8 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 md:flex-row md:items-center md:justify-between">
        <p>TCABR analyzes public GitHub data. Scores are statistical signals, not verdicts.</p>
        <nav className="flex gap-4">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/removal">Request removal</Link>
        </nav>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Write `apps/web/components/DisclaimerBanner.tsx`**

```tsx
export function DisclaimerBanner() {
  return (
    <aside className="mx-auto mt-6 max-w-3xl rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
      <strong>Heads up:</strong> anomaly scores highlight <em>atypical</em> stargazer-profile patterns
      in public GitHub data. They are not accusations. See{" "}
      <a href="/about" className="underline">how this works</a>.
    </aside>
  );
}
```

- [ ] **Step 4: Update `apps/web/app/layout.tsx`**

```tsx
import "./globals.css";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "To Catch A Bot Repo",
  description: "Is this repo's growth organic? Investigative analytics for GitHub stargazers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/SiteHeader.tsx apps/web/components/SiteFooter.tsx apps/web/components/DisclaimerBanner.tsx apps/web/app/layout.tsx
git commit -m "feat(web): site chrome (header, footer, disclaimer banner)"
```

---

## Task 10: SearchForm component

**Files:**
- Create: `apps/web/components/SearchForm.tsx`
- Test: `apps/web/tests/component/SearchForm.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/tests/component/SearchForm.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchForm } from "@/components/SearchForm";

describe("SearchForm", () => {
  it("submits parsed repo on enter", async () => {
    const onSubmit = vi.fn();
    render(<SearchForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox"), "https://github.com/vercel/next.js");
    await userEvent.click(screen.getByRole("button", { name: /scan/i }));
    expect(onSubmit).toHaveBeenCalledWith({ owner: "vercel", name: "next.js" });
  });

  it("shows error on invalid input", async () => {
    const onSubmit = vi.fn();
    render(<SearchForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox"), "garbage");
    await userEvent.click(screen.getByRole("button", { name: /scan/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/expected owner/i);
  });
});
```

- [ ] **Step 2: Write `apps/web/components/SearchForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { parseRepoRef, RepoRefError } from "@/lib/repo-ref";
import type { RepoRef } from "@tcabr/shared";

export function SearchForm({
  onSubmit,
}: {
  onSubmit: (ref: RepoRef) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const ref = parseRepoRef(value);
          setSubmitting(true);
          await onSubmit(ref);
        } catch (err) {
          if (err instanceof RepoRefError) setError(err.message);
          else setError("something went wrong");
        } finally {
          setSubmitting(false);
        }
      }}
      className="flex flex-col gap-2 md:flex-row md:items-stretch"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="owner/name or github.com URL"
        className="flex-1 rounded-md border border-neutral-300 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={submitting || !value.trim()}
        className="rounded-md bg-neutral-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {submitting ? "Scanning..." : "Scan"}
      </button>
      {error && (
        <div role="alert" className="text-sm text-red-600 md:basis-full">
          {error}
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Run test**

```bash
cd apps/web && pnpm test:unit SearchForm && cd ../..
```

Expected: 2 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/SearchForm.tsx apps/web/tests/component/SearchForm.test.tsx
git commit -m "feat(web): SearchForm with client-side repo-ref validation"
```

---

## Task 11: Landing page with live search + leaderboard preview

**Files:**
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Overwrite `apps/web/app/page.tsx`**

```tsx
import Link from "next/link";
import { SearchForm } from "@/components/SearchForm";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { fetchLeaderboard } from "@/lib/snapshots";

export default async function Home() {
  const [sus, clean] = await Promise.all([
    fetchLeaderboard("suspicious", 5),
    fetchLeaderboard("clean", 5),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
        Is this repo&apos;s growth organic?
      </h1>
      <p className="mt-4 text-lg text-neutral-600 dark:text-neutral-400">
        Paste any public GitHub repo. We analyze its stargazers against transparent
        heuristics and show you what we found.
      </p>
      <div className="mt-8">
        <SubmitAndNavigate />
      </div>
      <DisclaimerBanner />

      <section className="mt-16 grid gap-8 md:grid-cols-2">
        <LeaderboardPreview title="Most anomalous" rows={sus} />
        <LeaderboardPreview title="Cleanest organic" rows={clean} />
      </section>
      <p className="mt-8 text-sm text-neutral-500">
        <Link href="/leaderboard" className="underline">See the full leaderboard →</Link>
      </p>
    </div>
  );
}

function LeaderboardPreview({
  title,
  rows,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof fetchLeaderboard>>;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.length === 0 && (
          <li className="py-3 text-sm text-neutral-500">No scans yet.</li>
        )}
        {rows.map((r) => (
          <li key={r.repo_id} className="flex items-center justify-between py-3 text-sm">
            <Link href={`/r/${r.owner}/${r.name}`} className="hover:underline">
              {r.owner}/{r.name}
            </Link>
            <span className="font-mono tabular-nums">{r.anomaly_score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Below the component (same file), add a thin client shim that navigates after scan enqueue:

- [ ] **Step 2: Split out `SubmitAndNavigate` into its own client component**

Move the client logic into `apps/web/components/SubmitAndNavigate.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { SearchForm } from "@/components/SearchForm";

export function SubmitAndNavigate() {
  const router = useRouter();
  return (
    <SearchForm
      onSubmit={async (ref) => {
        const resp = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: `${ref.owner}/${ref.name}` }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error ?? "scan failed");
        if (data.cached) {
          router.push(data.report_url);
          return;
        }
        router.push(`/r/${ref.owner}/${ref.name}?pending=${data.job_id}`);
      }}
    />
  );
}
```

Update the import in `apps/web/app/page.tsx`:

```tsx
import { SubmitAndNavigate } from "@/components/SubmitAndNavigate";
```

- [ ] **Step 3: Typecheck and commit**

```bash
cd apps/web && pnpm typecheck && cd ../..
git add apps/web/app/page.tsx apps/web/components/SubmitAndNavigate.tsx
git commit -m "feat(web): landing page with search + leaderboard preview"
```

---

## Task 12: ObscuredUsername component

**Files:**
- Create: `apps/web/components/ObscuredUsername.tsx`
- Test: `apps/web/tests/component/ObscuredUsername.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/tests/component/ObscuredUsername.test.tsx
import { render, screen } from "@testing-library/react";
import { ObscuredUsername } from "@/components/ObscuredUsername";

describe("ObscuredUsername", () => {
  it("blurs by default", () => {
    render(<ObscuredUsername username="badactor" />);
    const el = screen.getByLabelText(/obscured username/i);
    expect(el).toHaveClass("blur-sm");
    expect(el).not.toHaveTextContent("badactor");
  });

  it("reveals when allowed", () => {
    render(<ObscuredUsername username="badactor" reveal />);
    expect(screen.getByText("badactor")).toBeVisible();
  });
});
```

- [ ] **Step 2: Write `apps/web/components/ObscuredUsername.tsx`**

```tsx
export function ObscuredUsername({
  username,
  reveal = false,
}: {
  username: string;
  reveal?: boolean;
}) {
  if (reveal) {
    return <span className="font-mono text-sm">{username}</span>;
  }
  const masked = username.replace(/[a-zA-Z0-9]/g, "•");
  return (
    <span
      aria-label={`obscured username: ${username.length} characters`}
      className="inline-block select-none font-mono text-sm blur-sm"
    >
      {masked}
    </span>
  );
}
```

- [ ] **Step 3: Run test and commit**

```bash
cd apps/web && pnpm test:unit ObscuredUsername && cd ../..
git add apps/web/components/ObscuredUsername.tsx apps/web/tests/component/ObscuredUsername.test.tsx
git commit -m "feat(web): ObscuredUsername with blur + accessible label (reveal hook for Plan 4)"
```

---

## Task 13: Report page components (ScoreHero, FeatureBreakdown, StarTimeSeries, StargazerGallery)

**Files:**
- Create: `apps/web/components/ScoreHero.tsx`
- Create: `apps/web/components/FeatureBreakdown.tsx`
- Create: `apps/web/components/StarTimeSeries.tsx`
- Create: `apps/web/components/StargazerGallery.tsx`

- [ ] **Step 1: Install Recharts**

```bash
cd apps/web && pnpm add recharts && cd ../..
```

- [ ] **Step 2: Write `apps/web/components/ScoreHero.tsx`**

```tsx
export function ScoreHero({
  score,
  ciLow,
  ciHigh,
  sampleSize,
  stargazerTotal,
}: {
  score: number;
  ciLow: number;
  ciHigh: number;
  sampleSize: number;
  stargazerTotal: number;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-baseline gap-3">
        <div className="font-mono text-6xl font-bold tabular-nums">{score}</div>
        <div className="text-sm text-neutral-500">/ 100 anomaly score</div>
      </div>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        95% CI: <span className="font-mono">{ciLow}</span>–<span className="font-mono">{ciHigh}</span>{" "}
        · sampled <span className="font-mono">{sampleSize.toLocaleString()}</span> of{" "}
        <span className="font-mono">{stargazerTotal.toLocaleString()}</span> stargazers
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Write `apps/web/components/FeatureBreakdown.tsx`**

```tsx
"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FEATURE_WEIGHTS } from "@tcabr/shared";

export function FeatureBreakdown({
  breakdown,
  sampleSize,
}: {
  breakdown: Record<string, number>;
  sampleSize: number;
}) {
  const data = FEATURE_WEIGHTS.features.map((f) => ({
    id: f.id,
    label: f.id.replace(/_/g, " "),
    hits: breakdown[f.id] ?? 0,
    percent: sampleSize > 0 ? Math.round((100 * (breakdown[f.id] ?? 0)) / sampleSize) : 0,
    weight: f.weight,
    description: f.description,
  }));
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Feature breakdown</h2>
      <p className="mt-1 text-sm text-neutral-500">
        % of sampled stargazers whose profile triggered each signal. Higher weight = higher contribution to the anomaly score.
      </p>
      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 16, right: 24 }}>
            <XAxis type="number" domain={[0, 100]} unit="%" />
            <YAxis type="category" dataKey="label" width={130} />
            <Tooltip
              formatter={(_v, _n, { payload }) => [
                `${payload.percent}% (${payload.hits} of ${sampleSize})`,
                `weight ${payload.weight}`,
              ]}
              labelFormatter={(l) => l}
            />
            <Bar dataKey="percent" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Write `apps/web/components/StarTimeSeries.tsx`**

```tsx
"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function StarTimeSeries({ data }: { data: { date: string; n: number }[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Star velocity</h2>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={32} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="n" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Write `apps/web/components/StargazerGallery.tsx`**

```tsx
import { ObscuredUsername } from "./ObscuredUsername";

export interface StargazerRow {
  username: string;
  anomaly_score: number;
  top_features: string[];
}

export function StargazerGallery({
  rows,
  reveal = false,
}: {
  rows: StargazerRow[];
  reveal?: boolean;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Top flagged stargazers</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Usernames are obscured by default. Pro subscribers can reveal them. Signals only — not verdicts.
      </p>
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          >
            <div className="flex items-center gap-3">
              <ObscuredUsername username={r.username} reveal={reveal} />
              <div className="text-xs text-neutral-500">{r.top_features.join(", ")}</div>
            </div>
            <span className="font-mono text-sm tabular-nums">{r.anomaly_score}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ScoreHero.tsx apps/web/components/FeatureBreakdown.tsx apps/web/components/StarTimeSeries.tsx apps/web/components/StargazerGallery.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): report components (score, breakdown, time-series, gallery)"
```

---

## Task 14: Report page `/r/[owner]/[name]`

**Files:**
- Create: `apps/web/app/r/[owner]/[name]/page.tsx`
- Create: `apps/web/app/r/[owner]/[name]/loading.tsx`
- Create: `apps/web/app/r/[owner]/[name]/not-found.tsx`
- Create: `apps/web/components/PendingPoller.tsx`
- Create: `apps/web/lib/top-flagged.ts`

- [ ] **Step 1: Write `apps/web/lib/top-flagged.ts`**

```typescript
import { supabaseService } from "./supabase";
import type { StargazerRow } from "@/components/StargazerGallery";

export async function fetchTopFlagged(snapshotId: string, limit = 24): Promise<StargazerRow[]> {
  const db = supabaseService();
  const { data } = await db
    .from("stargazer_classification")
    .select("username, anomaly_score, feature_hits")
    .eq("snapshot_id", snapshotId)
    .order("anomaly_score", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const hits = (r.feature_hits as { id: string; triggered: boolean }[]).filter((h) => h.triggered);
    return {
      username: r.username,
      anomaly_score: r.anomaly_score,
      top_features: hits.slice(0, 3).map((h) => h.id.replace(/_/g, " ")),
    };
  });
}
```

- [ ] **Step 2: Write `apps/web/app/r/[owner]/[name]/loading.tsx`**

```tsx
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-neutral-500">Loading report…</div>
  );
}
```

- [ ] **Step 3: Write `apps/web/app/r/[owner]/[name]/not-found.tsx`**

```tsx
export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-bold">No report yet</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        This repo has not been scanned. Submit it on the home page.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Write `apps/web/components/PendingPoller.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function PendingPoller({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [state, setState] = useState<string>("queued");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await fetch(`/api/scan/${jobId}`);
      if (!alive) return;
      if (!r.ok) {
        setErr("could not poll job");
        return;
      }
      const j = await r.json();
      setState(j.state);
      if (j.state === "done") {
        router.refresh();
      } else if (j.state === "error") {
        setErr(j.error ?? "scan failed");
      } else {
        setTimeout(tick, 2000);
      }
    };
    tick();
    return () => { alive = false; };
  }, [jobId, router]);

  if (err) return <div role="alert" className="text-red-600">Error: {err}</div>;
  return (
    <div className="rounded-md border border-neutral-200 p-6 text-sm dark:border-neutral-800">
      <p className="font-medium">Scan {state}…</p>
      <p className="mt-1 text-neutral-500">This page will auto-refresh when the report is ready.</p>
    </div>
  );
}
```

- [ ] **Step 5: Write `apps/web/app/r/[owner]/[name]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { fetchLatestSnapshot } from "@/lib/snapshots";
import { fetchTopFlagged } from "@/lib/top-flagged";
import { ScoreHero } from "@/components/ScoreHero";
import { FeatureBreakdown } from "@/components/FeatureBreakdown";
import { StarTimeSeries } from "@/components/StarTimeSeries";
import { StargazerGallery } from "@/components/StargazerGallery";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { PendingPoller } from "@/components/PendingPoller";
import { supabaseService } from "@/lib/supabase";

interface Params {
  owner: string;
  name: string;
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ pending?: string }>;
}) {
  const { owner, name } = await params;
  const { pending } = await searchParams;

  const snap = await fetchLatestSnapshot(owner, name);
  if (!snap && !pending) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="text-sm text-neutral-500">Report for</div>
      <h1 className="text-3xl font-bold">
        {owner}/{name}
      </h1>
      <DisclaimerBanner />

      {!snap && pending ? (
        <div className="mt-8">
          <PendingPoller jobId={pending} />
        </div>
      ) : snap ? (
        <>
          <div className="mt-8">
            <ScoreHero
              score={snap.anomaly_score}
              ciLow={snap.score_ci_low}
              ciHigh={snap.score_ci_high}
              sampleSize={snap.sample_size}
              stargazerTotal={snap.stargazer_total}
            />
          </div>
          <FeatureBreakdown breakdown={snap.feature_breakdown} sampleSize={snap.sample_size} />
          <StarTimeSeries data={snap.star_timeseries} />
          <LazyGallery owner={owner} name={name} />
          <p className="mt-8 text-xs text-neutral-500">
            Snapshot created {new Date(snap.created_at).toUTCString()}
          </p>
        </>
      ) : null}
    </div>
  );
}

async function LazyGallery({ owner, name }: { owner: string; name: string }) {
  const db = supabaseService();
  const { data: repo } = await db
    .from("repo").select("id").eq("owner", owner).eq("name", name).maybeSingle();
  if (!repo) return null;
  const { data: snapshot } = await db
    .from("repo_snapshot").select("id")
    .eq("repo_id", repo.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!snapshot) return null;
  const rows = await fetchTopFlagged(snapshot.id);
  return <StargazerGallery rows={rows} reveal={false} />;
}
```

- [ ] **Step 6: Typecheck and commit**

```bash
cd apps/web && pnpm typecheck && cd ../..
git add apps/web/app/r/ apps/web/components/PendingPoller.tsx apps/web/lib/top-flagged.ts
git commit -m "feat(web): report page /r/[owner]/[name] with pending poller"
```

---

## Task 15: Leaderboard page + table component

**Files:**
- Create: `apps/web/components/LeaderboardTable.tsx`
- Create: `apps/web/app/leaderboard/page.tsx`
- Test: `apps/web/tests/component/LeaderboardTable.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/tests/component/LeaderboardTable.test.tsx
import { render, screen } from "@testing-library/react";
import { LeaderboardTable } from "@/components/LeaderboardTable";

describe("LeaderboardTable", () => {
  it("renders repo rows with link and score", () => {
    render(
      <LeaderboardTable
        rows={[
          {
            repo_id: "1", owner: "a", name: "b", star_count: 1000,
            anomaly_score: 72, score_ci_low: 65, score_ci_high: 78,
            sample_size: 2000, stargazer_total: 2000,
            feature_breakdown: {}, star_timeseries: [], created_at: "2026-04-15T00:00:00Z",
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "a/b" })).toHaveAttribute("href", "/r/a/b");
    expect(screen.getByText("72")).toBeVisible();
  });
});
```

- [ ] **Step 2: Write `apps/web/components/LeaderboardTable.tsx`**

```tsx
import Link from "next/link";
import type { LatestSnapshot } from "@/lib/snapshots";

export function LeaderboardTable({ rows }: { rows: LatestSnapshot[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">No scans yet.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-neutral-500">
          <th className="py-2">Repo</th>
          <th className="py-2 text-right">Stars</th>
          <th className="py-2 text-right">Score</th>
          <th className="py-2 text-right">CI</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.repo_id} className="border-b last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-900">
            <td className="py-2">
              <Link href={`/r/${r.owner}/${r.name}`} className="hover:underline">
                {r.owner}/{r.name}
              </Link>
            </td>
            <td className="py-2 text-right font-mono tabular-nums">{r.star_count.toLocaleString()}</td>
            <td className="py-2 text-right font-mono text-base tabular-nums">{r.anomaly_score}</td>
            <td className="py-2 text-right font-mono text-xs text-neutral-500">
              {r.score_ci_low}–{r.score_ci_high}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Write `apps/web/app/leaderboard/page.tsx`**

```tsx
import { fetchLeaderboard } from "@/lib/snapshots";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Leaderboard() {
  const [sus, clean] = await Promise.all([
    fetchLeaderboard("suspicious", 25),
    fetchLeaderboard("clean", 25),
  ]);
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-bold">Leaderboard</h1>
      <DisclaimerBanner />
      <section className="mt-8 grid gap-12 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Most anomalous growth</h2>
          <LeaderboardTable rows={sus} />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Cleanest organic growth</h2>
          <LeaderboardTable rows={clean} />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/web && pnpm test:unit LeaderboardTable && pnpm typecheck && cd ../..
git add apps/web/components/LeaderboardTable.tsx apps/web/app/leaderboard/page.tsx apps/web/tests/component/LeaderboardTable.test.tsx
git commit -m "feat(web): leaderboard page with two-column sus/clean tables"
```

---

## Task 16: About / Terms / Privacy / Removal-stub pages

**Files:**
- Create: `apps/web/app/about/page.tsx`
- Create: `apps/web/app/terms/page.tsx`
- Create: `apps/web/app/privacy/page.tsx`
- Create: `apps/web/app/removal/page.tsx`

- [ ] **Step 1: Write `apps/web/app/about/page.tsx`**

```tsx
import { FEATURE_WEIGHTS } from "@tcabr/shared";

export default function About() {
  return (
    <article className="prose mx-auto max-w-2xl px-6 py-12 dark:prose-invert">
      <h1>How TCABR works</h1>
      <p>
        TCABR reads public GitHub data (repo metadata, stargazer timestamps, public user
        profiles) and computes an <strong>anomaly score</strong> for each repo&apos;s stargazer
        sample.
      </p>
      <p>
        Scores are statistical signals — not accusations or verdicts. Every score is
        transparent: we show exactly which features contributed and how much.
      </p>
      <h2>The features</h2>
      <ul>
        {FEATURE_WEIGHTS.features.map((f) => (
          <li key={f.id}>
            <code>{f.id}</code> (weight {f.weight}) — {f.description}
          </li>
        ))}
      </ul>
      <h2>Sampling</h2>
      <p>
        Repos with more than 5,000 stars are analyzed via a random sample of 2,000 stargazers.
        The report includes a 95% bootstrap confidence interval so you can judge precision.
      </p>
      <h2>What this is not</h2>
      <p>
        This is investigative analysis of public data, presented for informational and
        satirical purposes. It does not label individuals as bots, and no individual profile
        data is redistributed. See our <a href="/terms">Terms</a> and <a href="/privacy">Privacy</a>.
      </p>
    </article>
  );
}
```

- [ ] **Step 2: Write `apps/web/app/terms/page.tsx`**

```tsx
export default function Terms() {
  return (
    <article className="prose mx-auto max-w-2xl px-6 py-12 dark:prose-invert">
      <h1>Terms of Service</h1>
      <p>
        <strong>Draft.</strong> The production Terms are generated by Termly and embedded here
        before launch. Key provisions we intend to include:
      </p>
      <ul>
        <li>No warranty; analysis is provided as-is for informational and satirical purposes.</li>
        <li>No guarantees of accuracy; scores are statistical signals, not verdicts.</li>
        <li>No commercial re-use of scan data without permission.</li>
        <li>
          Users agree to indemnify TCABR for any misuse of reports, including republication
          as factual claims.
        </li>
      </ul>
    </article>
  );
}
```

- [ ] **Step 3: Write `apps/web/app/privacy/page.tsx`**

```tsx
export default function Privacy() {
  return (
    <article className="prose mx-auto max-w-2xl px-6 py-12 dark:prose-invert">
      <h1>Privacy</h1>
      <p>
        <strong>Draft.</strong> The production Privacy Policy is generated by Termly and
        embedded here before launch. Key provisions we intend to include:
      </p>
      <ul>
        <li>We collect public GitHub data (usernames, join dates, public counts) for analysis.</li>
        <li>
          We collect account data (email, GitHub OAuth, Stripe customer) for paid users. Tokens
          are encrypted at rest.
        </li>
        <li>We honor removal requests for individual profiles via <a href="/removal">this form</a>.</li>
        <li>We respect GDPR/CCPA rights; contact us at <a href="mailto:privacy@tcabr.example">privacy@tcabr.example</a>.</li>
      </ul>
    </article>
  );
}
```

- [ ] **Step 4: Write `apps/web/app/removal/page.tsx`** (stub — Plan 5 replaces it)

```tsx
export default function RemovalStub() {
  return (
    <article className="prose mx-auto max-w-2xl px-6 py-12 dark:prose-invert">
      <h1>Request removal</h1>
      <p>
        The removal form is under construction. In the meantime, email{" "}
        <a href="mailto:removal@tcabr.example">removal@tcabr.example</a> with your GitHub
        username and we will exclude your profile from future reports and blank it in existing ones.
      </p>
    </article>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/about/ apps/web/app/terms/ apps/web/app/privacy/ apps/web/app/removal/
git commit -m "feat(web): About, Terms, Privacy, Removal-stub pages"
```

---

## Task 17: Playwright smoke test

**Files:**
- Create: `apps/web/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Write `apps/web/tests/e2e/smoke.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

test("landing renders with search form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/organic/i);
  await expect(page.getByRole("textbox")).toBeVisible();
  await expect(page.getByRole("button", { name: /scan/i })).toBeVisible();
});

test("leaderboard page renders both tables", async ({ page }) => {
  await page.goto("/leaderboard");
  await expect(page.getByText(/most anomalous growth/i)).toBeVisible();
  await expect(page.getByText(/cleanest organic growth/i)).toBeVisible();
});

test("invalid repo input shows inline error", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox").fill("garbage");
  await page.getByRole("button", { name: /scan/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("about page lists feature weights", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByText("new_account")).toBeVisible();
  await expect(page.getByText("star_burst")).toBeVisible();
});
```

- [ ] **Step 2: Install Playwright browsers**

```bash
cd apps/web && pnpm exec playwright install --with-deps chromium && cd ../..
```

- [ ] **Step 3: Run smoke (requires local supabase + next dev)**

```bash
cd apps/web && pnpm test:e2e && cd ../..
```

Expected: 4 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/
git commit -m "test(web): playwright smoke for landing, leaderboard, report error, about"
```

---

## Task 18: Full sweep + CI integration

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add unit test step to `node` job in `.github/workflows/ci.yml`**

Insert before `pnpm --filter @tcabr/web build`:

```yaml
      - run: pnpm --filter @tcabr/web test:unit
```

- [ ] **Step 2: Full local sweep**

```bash
pnpm --filter @tcabr/shared test
pnpm --filter @tcabr/web test:unit
pnpm --filter @tcabr/web typecheck
pnpm --filter @tcabr/web build
cd apps/worker && .venv/bin/pytest -v && cd ../..
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run web unit tests"
```

---

## Self-Review Notes

- **Spec coverage:** UX sections 1–4 (landing, report, leaderboard, account-lite), 5 (About), 6 (Terms/Privacy embedded as Termly-ready stubs), 7 (Removal stub). Advisory #1 — per-tier cache freshness — is implemented explicitly in `lib/cache-policy.ts` and consumed by `/api/scan`. Advisory #2 — star-burst as repo-level pre-pass — is in Plan 2 and consumed here via `feature_breakdown` rendering.
- **Deferred to Plan 4 (paywall):** OAuth sign-in, Stripe gating, tier-aware reveal of usernames in gallery. The scaffolding (`cache-policy` tier enum, `ObscuredUsername reveal` prop) is already in place so Plan 4 is a thin wire-up, not a rewrite.
- **Deferred to Plan 5 (trust/legal):** real removal form + admin queue, disclaimer copy review, Sentry source-map upload. The `DisclaimerBanner` component exists as a single source of truth for future copy edits.
