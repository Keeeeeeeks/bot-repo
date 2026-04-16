# TCABR Plan 5 — Trust & Legal Surface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop on defamation/doxxing risk. Ship the real removal-request form + admin queue, enforce removal filtering across every read path, surface disclaimer language consistently, and harden observability (Sentry + structured logs) so bad-press events can be investigated quickly. This plan depends on Plan 1 (schema + scaffolding), Plan 2 (snapshots written), and Plan 3 (read APIs + pages). It does NOT depend on Plan 4 (paywall) — admin auth here uses a simple email allowlist so this plan can ship in parallel.

**Architecture:** Removal requests land in `removal_request`. A tiny admin route (email-allowlist magic link, no Stripe, no OAuth) lets the operator accept or reject them. On accept, a `user_exclusion` record is written and every read path filters it out. Disclaimer copy moves to a single config module. Sentry gets source-map upload, release tagging, and PII scrubbing. Worker logs go out as structured JSON to stdout (Fly.io → Axiom/Logtail forwarding is a deployment concern, not a code concern).

**Tech Stack:** Next.js 15 Route Handlers, Supabase, React Hook Form + zod (form validation), Resend or SMTP for admin magic links (env-driven), @sentry/nextjs and sentry-sdk (Python), structlog.

---

## File Structure

New files under `apps/web/` and `apps/worker/` created by this plan:

```
apps/web/
  app/
    removal/page.tsx                       # REPLACE stub with real form
    admin/
      login/page.tsx
      queue/page.tsx
      layout.tsx
    api/
      removal/
        route.ts                           # POST: create request
      admin/
        login/route.ts                     # POST: request magic link
        callback/route.ts                  # GET: verify + set cookie
        removal/[id]/route.ts              # POST: accept|reject
  components/
    RemovalForm.tsx
    AdminQueueRow.tsx
    ObscuredUsername.tsx                   # MODIFY: honors `excluded` flag
  lib/
    admin-auth.ts                          # magic-link + cookie session
    email.ts                               # pluggable sender (Resend or stub)
    exclusions.ts                          # is-excluded helpers + filter
    snapshots.ts                           # MODIFY: apply exclusion filter
    top-flagged.ts                         # MODIFY: apply exclusion filter
    copy.ts                                # central disclaimer/legal copy
  tests/
    unit/
      exclusions.test.ts
      admin-auth.test.ts
      copy.test.ts
    component/
      RemovalForm.test.tsx

apps/worker/
  src/tcabr_worker/
    exclusions.py                          # DB check for excluded usernames
    pipeline.py                            # MODIFY: skip excluded usernames in scoring
    log.py                                 # structlog configuration (JSON to stdout)
  tests/
    test_exclusions.py

supabase/migrations/
  20260416000002_exclusions.sql            # user_exclusion table + trigger
```

---

## Task 1: user_exclusion schema

**Files:**
- Create: `supabase/migrations/20260416000002_exclusions.sql`

- [ ] **Step 1: Write migration**

```sql
create table user_exclusion (
  gh_username        text primary key,
  removal_request_id uuid references removal_request(id) on delete set null,
  reason             text,
  created_at         timestamptz not null default now()
);

create index user_exclusion_created_idx on user_exclusion(created_at desc);

-- Surface a view that strips excluded usernames from future leaderboard/sample reads.
create or replace view stargazer_classification_public as
select c.*
from stargazer_classification c
where not exists (
  select 1 from user_exclusion e where e.gh_username = c.username
);
```

- [ ] **Step 2: Apply migration**

```bash
supabase db reset
pnpm seed:weights
```

Expected: three migrations apply; view queryable.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260416000002_exclusions.sql
git commit -m "feat(db): user_exclusion table + public classification view"
```

---

## Task 2: Central copy module

**Files:**
- Create: `apps/web/lib/copy.ts`
- Test: `apps/web/tests/unit/copy.test.ts`
- Modify: `apps/web/components/DisclaimerBanner.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// apps/web/tests/unit/copy.test.ts
import { describe, it, expect } from "vitest";
import { COPY } from "@/lib/copy";

describe("copy", () => {
  it("every key is non-empty string", () => {
    for (const [k, v] of Object.entries(COPY)) {
      expect(typeof v).toBe("string");
      expect(v.trim().length, k).toBeGreaterThan(10);
    }
  });
  it("never uses the word 'bot' in headline copy (hedged framing)", () => {
    expect(COPY.disclaimerShort.toLowerCase()).not.toContain("bot ");
    expect(COPY.aboutIntro.toLowerCase()).not.toContain(" bots ");
  });
});
```

- [ ] **Step 2: Write `apps/web/lib/copy.ts`**

```typescript
export const COPY = {
  disclaimerShort:
    "TCABR analyzes public GitHub data. Anomaly scores highlight atypical stargazer-profile patterns. They are signals, not verdicts.",
  disclaimerLong:
    "Every score on this site is computed from public GitHub profile data using transparent, weighted heuristic features. Scores are statistical signals about a sampled population — they do not assert anything about any individual account, and they are not accusations. If your profile has been included and you would like it excluded, use the removal form.",
  aboutIntro:
    "TCABR reads public GitHub data and computes an anomaly score for each repo's stargazer sample. Scores are statistical signals — not accusations or verdicts.",
  removalHelp:
    "Submit your GitHub username and we will remove your profile from future reports and blank it in existing ones.",
  removalLegal:
    "Submitting a removal request does not admit anything about your account. We honor all valid requests regardless of reason.",
};

export type CopyKey = keyof typeof COPY;
```

- [ ] **Step 3: Modify `apps/web/components/DisclaimerBanner.tsx` to use central copy**

```tsx
import { COPY } from "@/lib/copy";

export function DisclaimerBanner() {
  return (
    <aside className="mx-auto mt-6 max-w-3xl rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
      <strong>Heads up:</strong> {COPY.disclaimerShort}{" "}
      <a href="/about" className="underline">How this works →</a>
    </aside>
  );
}
```

- [ ] **Step 4: Run test, commit**

```bash
cd apps/web && pnpm test:unit copy && cd ../..
git add apps/web/lib/copy.ts apps/web/tests/unit/copy.test.ts apps/web/components/DisclaimerBanner.tsx
git commit -m "feat(web): central copy module for disclaimer/legal language"
```

---

## Task 3: exclusions helper (web)

**Files:**
- Create: `apps/web/lib/exclusions.ts`
- Test: `apps/web/tests/unit/exclusions.test.ts`

- [ ] **Step 1: Write failing test with mocked supabase**

```typescript
// apps/web/tests/unit/exclusions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const rows: { gh_username: string }[] = [];
vi.mock("@/lib/supabase", () => ({
  supabaseService: () => ({
    from: () => ({
      select: () => ({
        in: (_col: string, usernames: string[]) => ({
          then: (cb: (r: { data: { gh_username: string }[] }) => void) =>
            cb({ data: rows.filter((r) => usernames.includes(r.gh_username)) }),
        }),
      }),
    }),
  }),
}));

describe("exclusions", () => {
  beforeEach(() => {
    rows.length = 0;
  });

  it("loadExcluded returns the intersection", async () => {
    rows.push({ gh_username: "bad1" }, { gh_username: "bad2" });
    const { loadExcluded } = await import("@/lib/exclusions");
    const out = await loadExcluded(["bad1", "ok", "bad2"]);
    expect(out).toEqual(new Set(["bad1", "bad2"]));
  });

  it("filterExcluded removes matches", async () => {
    const { filterExcluded } = await import("@/lib/exclusions");
    const excluded = new Set(["x"]);
    expect(
      filterExcluded([{ username: "x" }, { username: "y" }], excluded, (r) => r.username),
    ).toEqual([{ username: "y" }]);
  });
});
```

- [ ] **Step 2: Write `apps/web/lib/exclusions.ts`**

```typescript
import { supabaseService } from "./supabase";

export async function loadExcluded(usernames: string[]): Promise<Set<string>> {
  if (usernames.length === 0) return new Set();
  const db = supabaseService();
  const { data } = await db
    .from("user_exclusion")
    .select("gh_username")
    .in("gh_username", usernames);
  return new Set((data ?? []).map((r) => r.gh_username));
}

export function filterExcluded<T>(
  rows: T[],
  excluded: Set<string>,
  getUsername: (row: T) => string,
): T[] {
  return rows.filter((r) => !excluded.has(getUsername(r)));
}
```

- [ ] **Step 3: Run test, commit**

```bash
cd apps/web && pnpm test:unit exclusions && cd ../..
git add apps/web/lib/exclusions.ts apps/web/tests/unit/exclusions.test.ts
git commit -m "feat(web): exclusions helper for filtering removed profiles"
```

---

## Task 4: Wire exclusions into top-flagged + snapshots

**Files:**
- Modify: `apps/web/lib/top-flagged.ts`

- [ ] **Step 1: Update `apps/web/lib/top-flagged.ts`**

```typescript
import { supabaseService } from "./supabase";
import { loadExcluded, filterExcluded } from "./exclusions";
import type { StargazerRow } from "@/components/StargazerGallery";

export async function fetchTopFlagged(snapshotId: string, limit = 24): Promise<StargazerRow[]> {
  const db = supabaseService();
  const { data } = await db
    .from("stargazer_classification")
    .select("username, anomaly_score, feature_hits")
    .eq("snapshot_id", snapshotId)
    .order("anomaly_score", { ascending: false })
    .limit(limit * 2); // over-fetch so we still have ~limit after filtering

  const rows = (data ?? []).map((r) => {
    const hits = (r.feature_hits as { id: string; triggered: boolean }[]).filter((h) => h.triggered);
    return {
      username: r.username,
      anomaly_score: r.anomaly_score,
      top_features: hits.slice(0, 3).map((h) => h.id.replace(/_/g, " ")),
    };
  });

  const excluded = await loadExcluded(rows.map((r) => r.username));
  return filterExcluded(rows, excluded, (r) => r.username).slice(0, limit);
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd apps/web && pnpm typecheck && cd ../..
git add apps/web/lib/top-flagged.ts
git commit -m "feat(web): apply user_exclusion filter to gallery rows"
```

---

## Task 5: Removal form component + page

**Files:**
- Create: `apps/web/components/RemovalForm.tsx`
- Modify: `apps/web/app/removal/page.tsx` (replace stub)
- Test: `apps/web/tests/component/RemovalForm.test.tsx`

- [ ] **Step 1: Add deps**

```bash
cd apps/web && pnpm add react-hook-form @hookform/resolvers && cd ../..
```

- [ ] **Step 2: Write failing test**

```tsx
// apps/web/tests/component/RemovalForm.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { RemovalForm } from "@/components/RemovalForm";

describe("RemovalForm", () => {
  it("submits username + email + reason", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RemovalForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/github username/i), "octocat");
    await userEvent.type(screen.getByLabelText(/contact email/i), "me@example.com");
    await userEvent.type(screen.getByLabelText(/reason/i), "please remove");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      gh_username: "octocat",
      contact_email: "me@example.com",
      reason: "please remove",
    });
  });

  it("rejects empty username", async () => {
    const onSubmit = vi.fn();
    render(<RemovalForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/username is required/i)).toBeVisible();
  });
});
```

- [ ] **Step 3: Write `apps/web/components/RemovalForm.tsx`**

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const Schema = z.object({
  gh_username: z.string().min(1, "username is required").max(64),
  contact_email: z.string().email().optional().or(z.literal("")),
  reason: z.string().max(1000).optional().or(z.literal("")),
});

export type RemovalInput = z.infer<typeof Schema>;

export function RemovalForm({
  onSubmit,
}: {
  onSubmit: (input: RemovalInput) => void | Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<RemovalInput>({ resolver: zodResolver(Schema) });

  if (isSubmitSuccessful) {
    return (
      <div className="rounded-md border border-green-300 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950/40">
        Request received. We will process it within a few business days.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="gh_username" className="block text-sm font-medium">GitHub username</label>
        <input id="gh_username" {...register("gh_username")} className="mt-1 w-full rounded-md border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
        {errors.gh_username && <p className="mt-1 text-sm text-red-600">{errors.gh_username.message}</p>}
      </div>
      <div>
        <label htmlFor="contact_email" className="block text-sm font-medium">Contact email (optional)</label>
        <input id="contact_email" type="email" {...register("contact_email")} className="mt-1 w-full rounded-md border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
        {errors.contact_email && <p className="mt-1 text-sm text-red-600">{errors.contact_email.message}</p>}
      </div>
      <div>
        <label htmlFor="reason" className="block text-sm font-medium">Reason (optional)</label>
        <textarea id="reason" rows={3} {...register("reason")} className="mt-1 w-full rounded-md border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isSubmitting ? "Submitting..." : "Submit request"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Replace `apps/web/app/removal/page.tsx`**

```tsx
"use client";

import { RemovalForm, type RemovalInput } from "@/components/RemovalForm";
import { COPY } from "@/lib/copy";

export default function RemovalPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold">Request removal</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">{COPY.removalHelp}</p>
      <p className="mt-2 text-sm text-neutral-500">{COPY.removalLegal}</p>
      <div className="mt-8">
        <RemovalForm
          onSubmit={async (input: RemovalInput) => {
            const r = await fetch("/api/removal", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
            });
            if (!r.ok) throw new Error(await r.text());
          }}
        />
      </div>
    </article>
  );
}
```

- [ ] **Step 5: Run test, commit**

```bash
cd apps/web && pnpm test:unit RemovalForm && cd ../..
git add apps/web/components/RemovalForm.tsx apps/web/app/removal/page.tsx apps/web/tests/component/RemovalForm.test.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): real removal form with validation"
```

---

## Task 6: POST /api/removal route

**Files:**
- Create: `apps/web/app/api/removal/route.ts`

- [ ] **Step 1: Write handler**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const Body = z.object({
  gh_username: z.string().min(1).max(64),
  contact_email: z.string().email().optional().or(z.literal("")),
  reason: z.string().max(1000).optional().or(z.literal("")),
});

const RATE_WINDOW_MIN = 10;

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const db = supabaseService();
  // Simple per-username rate limit: one open request per 10 minutes.
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60 * 1000).toISOString();
  const { data: existing } = await db
    .from("removal_request")
    .select("id")
    .eq("gh_username", parsed.data.gh_username)
    .gte("created_at", since)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "duplicate request; already queued" }, { status: 429 });
  }

  const { error } = await db.from("removal_request").insert({
    gh_username: parsed.data.gh_username,
    contact_email: parsed.data.contact_email || null,
    reason: parsed.data.reason || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Smoke test**

```bash
curl -s -X POST http://localhost:3000/api/removal \
  -H 'content-type: application/json' \
  -d '{"gh_username":"someone","contact_email":"a@b.com","reason":"test"}' | jq .
```

Expected: `{"ok":true}` on first call; `{"error":"duplicate request..."}` on immediate retry.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/removal/
git commit -m "feat(web): POST /api/removal with basic rate limit"
```

---

## Task 7: Admin auth (magic link + cookie)

**Files:**
- Create: `apps/web/lib/email.ts`
- Create: `apps/web/lib/admin-auth.ts`
- Create: `apps/web/app/api/admin/login/route.ts`
- Create: `apps/web/app/api/admin/callback/route.ts`
- Test: `apps/web/tests/unit/admin-auth.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/web/tests/unit/admin-auth.test.ts
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
```

- [ ] **Step 2: Write `apps/web/lib/admin-auth.ts`**

```typescript
import { createHmac, timingSafeEqual } from "crypto";

export interface TokenPayload {
  email: string;
  exp: number; // ms
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export function signToken(email: string, secret: string, ttlMs: number): string {
  const payload: TokenPayload = { email, exp: Date.now() + ttlMs };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): TokenPayload {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("malformed token");
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = b64urlDecode(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new Error("invalid signature");
  }
  const payload = JSON.parse(b64urlDecode(body).toString()) as TokenPayload;
  if (Date.now() > payload.exp) throw new Error("token expired");
  return payload;
}

export function adminAllowList(): string[] {
  return (process.env.ADMIN_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email: string): boolean {
  return adminAllowList().includes(email.toLowerCase());
}
```

- [ ] **Step 3: Write `apps/web/lib/email.ts`**

```typescript
export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

export function makeMailer(): Mailer {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ADMIN_EMAIL_FROM ?? "admin@tcabr.local";
  if (!key) {
    return {
      async send(to, subject, text) {
        // Dev fallback: log to stdout so the operator can copy-paste the link.
        console.log(`[DEV EMAIL] to=${to} subject=${subject}\n${text}`);
      },
    };
  }
  return {
    async send(to, subject, text) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!r.ok) throw new Error(`email send failed: ${r.status}`);
    },
  };
}
```

- [ ] **Step 4: Write `apps/web/app/api/admin/login/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin, signToken } from "@/lib/admin-auth";
import { makeMailer } from "@/lib/email";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { email } = parsed.data;

  if (!isAdmin(email)) {
    // Always return OK to avoid leaking which emails are admins.
    return NextResponse.json({ ok: true });
  }
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!secret) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  const token = signToken(email, secret, 15 * 60 * 1000); // 15 min
  const origin = new URL(req.url).origin;
  const link = `${origin}/api/admin/callback?t=${encodeURIComponent(token)}`;
  await makeMailer().send(email, "TCABR admin login", `Click to sign in (15 min): ${link}`);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Write `apps/web/app/api/admin/callback/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { isAdmin, verifyToken } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("t");
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!token || !secret) return NextResponse.redirect(new URL("/admin/login", req.url));
  try {
    const { email } = verifyToken(token, secret);
    if (!isAdmin(email)) throw new Error("not an admin");
    const resp = NextResponse.redirect(new URL("/admin/queue", req.url));
    resp.cookies.set("tcabr_admin", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });
    return resp;
  } catch {
    return NextResponse.redirect(new URL("/admin/login?err=1", req.url));
  }
}
```

- [ ] **Step 6: Run auth unit test**

```bash
cd apps/web && pnpm test:unit admin-auth && cd ../..
```

Expected: 3 pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/admin-auth.ts apps/web/lib/email.ts apps/web/app/api/admin/ apps/web/tests/unit/admin-auth.test.ts
git commit -m "feat(web): admin magic-link auth (email allowlist + signed cookie)"
```

---

## Task 8: Admin queue UI

**Files:**
- Create: `apps/web/app/admin/layout.tsx`
- Create: `apps/web/app/admin/login/page.tsx`
- Create: `apps/web/app/admin/queue/page.tsx`
- Create: `apps/web/components/AdminQueueRow.tsx`
- Create: `apps/web/app/api/admin/removal/[id]/route.ts`

- [ ] **Step 1: Write `apps/web/app/admin/layout.tsx` (server component, gates on cookie)**

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin, verifyToken } from "@/lib/admin-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = ""; // layout wraps both /admin/login and /admin/queue; skip auth check on login.
  const c = await cookies();
  const token = c.get("tcabr_admin")?.value;
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!secret) throw new Error("ADMIN_TOKEN_SECRET missing");

  let authed = false;
  if (token) {
    try {
      const { email } = verifyToken(token, secret);
      authed = isAdmin(email);
    } catch { /* fall through */ }
  }
  // This layout is simple enough that we conditionally redirect inside the page components.
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">TCABR Admin</h1>
        <span className="text-xs text-neutral-500">{authed ? "signed in" : "not signed in"}</span>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Write `apps/web/app/admin/login/page.tsx`**

```tsx
"use client";

import { useState } from "react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await fetch("/api/admin/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setSent(true);
      }}
      className="space-y-3"
    >
      <label htmlFor="email" className="block text-sm font-medium">Admin email</label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button type="submit" className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900">
        Send magic link
      </button>
      {sent && <p className="text-sm text-neutral-500">If that address is on the allowlist, a link has been sent.</p>}
    </form>
  );
}
```

- [ ] **Step 3: Write `apps/web/app/admin/queue/page.tsx`**

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin, verifyToken } from "@/lib/admin-auth";
import { supabaseService } from "@/lib/supabase";
import { AdminQueueRow } from "@/components/AdminQueueRow";

export const dynamic = "force-dynamic";

export default async function AdminQueue() {
  const c = await cookies();
  const token = c.get("tcabr_admin")?.value;
  const secret = process.env.ADMIN_TOKEN_SECRET!;
  if (!token) redirect("/admin/login");
  try {
    const { email } = verifyToken(token, secret);
    if (!isAdmin(email)) redirect("/admin/login");
  } catch {
    redirect("/admin/login");
  }

  const db = supabaseService();
  const { data: rows } = await db
    .from("removal_request")
    .select("id, gh_username, contact_email, reason, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">Removal queue</h2>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {(rows ?? []).map((r) => <AdminQueueRow key={r.id} req={r} />)}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Write `apps/web/components/AdminQueueRow.tsx`**

```tsx
"use client";

import { useState } from "react";

export interface RemovalReq {
  id: string;
  gh_username: string;
  contact_email: string | null;
  reason: string | null;
  status: "open" | "accepted" | "rejected";
  created_at: string;
}

export function AdminQueueRow({ req }: { req: RemovalReq }) {
  const [status, setStatus] = useState(req.status);
  const [busy, setBusy] = useState(false);

  async function act(action: "accept" | "reject") {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/removal/${req.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!r.ok) throw new Error(await r.text());
      setStatus(action === "accept" ? "accepted" : "rejected");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div>
        <div className="font-mono text-sm">{req.gh_username}</div>
        <div className="text-xs text-neutral-500">
          {new Date(req.created_at).toUTCString()}
          {req.contact_email ? ` · ${req.contact_email}` : ""}
        </div>
        {req.reason && <div className="mt-1 max-w-lg text-sm text-neutral-600 dark:text-neutral-400">{req.reason}</div>}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide dark:bg-neutral-800">{status}</span>
        {status === "open" && (
          <>
            <button disabled={busy} onClick={() => act("accept")} className="rounded-md bg-green-600 px-3 py-1 text-white disabled:opacity-50">Accept</button>
            <button disabled={busy} onClick={() => act("reject")} className="rounded-md border px-3 py-1 dark:border-neutral-700">Reject</button>
          </>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 5: Write `apps/web/app/api/admin/removal/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { isAdmin, verifyToken } from "@/lib/admin-auth";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const Body = z.object({ action: z.enum(["accept", "reject"]) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const c = await cookies();
  const token = c.get("tcabr_admin")?.value;
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!token || !secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { email } = verifyToken(token, secret);
    if (!isAdmin(email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { id } = await params;
  const db = supabaseService();

  const { data: rr } = await db
    .from("removal_request").select("id, gh_username, status").eq("id", id).maybeSingle();
  if (!rr) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rr.status !== "open") return NextResponse.json({ error: "already processed" }, { status: 409 });

  if (parsed.data.action === "accept") {
    await db.from("user_exclusion").upsert({
      gh_username: rr.gh_username,
      removal_request_id: rr.id,
      reason: "admin accepted removal",
    });
    await db.from("removal_request").update({ status: "accepted" }).eq("id", rr.id);
  } else {
    await db.from("removal_request").update({ status: "rejected" }).eq("id", rr.id);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: End-to-end manual test**

Add `ADMIN_EMAIL_ALLOWLIST=ops@tcabr.local` and `ADMIN_TOKEN_SECRET=$(openssl rand -hex 32)` to `.env.local`. Start dev server.

1. POST a fake removal via `/removal`.
2. Visit `/admin/login`, enter `ops@tcabr.local`, copy the link from terminal.
3. Follow it; land on `/admin/queue` with one row.
4. Accept it. Confirm a `user_exclusion` row exists via psql:
   ```bash
   psql "$DATABASE_URL" -c "select gh_username from user_exclusion;"
   ```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/admin/ apps/web/components/AdminQueueRow.tsx apps/web/app/api/admin/removal/
git commit -m "feat(web): admin queue UI with accept/reject actions"
```

---

## Task 9: Worker-side exclusion filtering (defense in depth)

**Files:**
- Create: `apps/worker/src/tcabr_worker/exclusions.py`
- Modify: `apps/worker/src/tcabr_worker/pipeline.py`
- Test: `apps/worker/tests/test_exclusions.py`

- [ ] **Step 1: Write failing test**

```python
# apps/worker/tests/test_exclusions.py
import pytest
import asyncpg

from tcabr_worker.config import settings
from tcabr_worker.exclusions import load_excluded


@pytest.fixture
async def pool() -> asyncpg.Pool:
    p = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    async with p.acquire() as c:
        await c.execute("delete from user_exclusion where gh_username like 'excl_%'")
        await c.execute("insert into user_exclusion(gh_username) values('excl_a'), ('excl_b')")
    yield p
    await p.close()


@pytest.mark.asyncio
async def test_load_excluded_intersects(pool: asyncpg.Pool) -> None:
    got = await load_excluded(pool, ["excl_a", "excl_c", "excl_b", "unrelated"])
    assert got == {"excl_a", "excl_b"}


@pytest.mark.asyncio
async def test_load_excluded_empty(pool: asyncpg.Pool) -> None:
    assert await load_excluded(pool, []) == set()
```

- [ ] **Step 2: Write `apps/worker/src/tcabr_worker/exclusions.py`**

```python
from __future__ import annotations

import asyncpg


async def load_excluded(pool: asyncpg.Pool, usernames: list[str]) -> set[str]:
    if not usernames:
        return set()
    async with pool.acquire() as c:
        rows = await c.fetch(
            "select gh_username from user_exclusion where gh_username = any($1::text[])",
            usernames,
        )
    return {r["gh_username"] for r in rows}
```

- [ ] **Step 3: Update `apps/worker/src/tcabr_worker/pipeline.py` to accept an optional exclusion set**

Add a parameter and apply before scoring:

```python
async def run_scan(
    req: ScanRequest,
    *,
    gh: _GH,
    get_cached: Callable[[str], Awaitable[UserProfile | None]],
    upsert_profile: Callable[[UserProfile], Awaitable[None]],
    sample_threshold: int | None = None,
    sample_size: int | None = None,
    excluded: set[str] | None = None,
) -> dict[str, Any]:
    ...
    sample, is_full = sample_stargazers(
        all_events, threshold, size, seed=hash(req.repo_slug) % (2**32)
    )
    if excluded:
        sample = [ev for ev in sample if ev.username not in excluded]
    ...
```

- [ ] **Step 4: Wire into `apps/worker/src/tcabr_worker/jobs.py`**

```python
from .exclusions import load_excluded

async def scan_repo(ctx, owner, name, user_token=None):
    pool = await get_pool()
    async with GitHubClient(token=user_token) as gh:
        all_usernames: list[str] = []
        # First pass to collect usernames for exclusion lookup.
        # (Minor inefficiency but bounded.)
        ...
```

Actually the simpler approach: pass a callable `is_excluded(username)` that looks up against a preloaded set. Replace `jobs.py` with:

```python
from __future__ import annotations

from functools import partial
from typing import Any

from .db import get_pool
from .exclusions import load_excluded
from .github import GitHubClient
from .models import ScanRequest
from .persist import persist_snapshot
from .pipeline import run_scan
from .profile_cache import get_cached, upsert_profile


async def scan_repo(
    ctx: dict,
    owner: str,
    name: str,
    user_token: str | None = None,
) -> dict[str, Any]:
    pool = await get_pool()
    async with GitHubClient(token=user_token) as gh:
        # Collect all stargazer usernames first for a single exclusion query.
        events = [e async for e in gh.iter_stargazers(owner, name)]
        excluded = await load_excluded(pool, [e.username for e in events])

        # Seed a "pre-fetched" generator so run_scan doesn't re-fetch.
        class _GH:
            async def fetch_repo_meta(self, o, n):
                return await gh.fetch_repo_meta(o, n)
            def iter_stargazers(self, o, n, **kw):
                async def gen():
                    for ev in events:
                        yield ev
                return gen()
            async def fetch_user_profile(self, u):
                return await gh.fetch_user_profile(u)
            async def count_recent_public_commits(self, u, days=60):
                return await gh.count_recent_public_commits(u, days)
            async def count_starred_repos(self, u):
                return await gh.count_starred_repos(u)

        snap = await run_scan(
            ScanRequest(owner=owner, name=name, user_token=user_token),
            gh=_GH(),
            get_cached=partial(_cached, pool),
            upsert_profile=partial(_upsert, pool),
            excluded=excluded,
        )
    snapshot_id = await persist_snapshot(pool, snap)
    return {"snapshot_id": str(snapshot_id), "anomaly_score": snap["anomaly_score"]}


async def _cached(pool, username):
    return await get_cached(pool, username, ttl_days=7)


async def _upsert(pool, profile):
    return await upsert_profile(pool, profile)
```

- [ ] **Step 5: Run tests**

```bash
cd apps/worker && .venv/bin/pytest tests/test_exclusions.py tests/test_pipeline.py -v && cd ../..
```

Expected: all pass (pipeline test unaffected because `excluded=None` is the default).

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/tcabr_worker/exclusions.py apps/worker/src/tcabr_worker/pipeline.py apps/worker/src/tcabr_worker/jobs.py apps/worker/tests/test_exclusions.py
git commit -m "feat(worker): exclude removed usernames from scan samples"
```

---

## Task 10: Structured logging for worker

**Files:**
- Create: `apps/worker/src/tcabr_worker/log.py`
- Modify: `apps/worker/src/tcabr_worker/main.py` (call `configure_logging` in startup)

- [ ] **Step 1: Write `apps/worker/src/tcabr_worker/log.py`**

```python
from __future__ import annotations

import logging
import sys

import structlog


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        stream=sys.stdout,
    )
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.EventRenamer("msg"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
```

- [ ] **Step 2: Update `apps/worker/src/tcabr_worker/main.py`**

Add to `startup`:

```python
from .log import configure_logging


async def startup(ctx: dict) -> None:
    configure_logging()
    init_sentry()
    ctx["started"] = True
```

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/tcabr_worker/log.py apps/worker/src/tcabr_worker/main.py
git commit -m "feat(worker): structured JSON logging to stdout"
```

---

## Task 11: Sentry hardening (PII scrub + release tagging)

**Files:**
- Modify: `apps/web/sentry.client.config.ts`
- Modify: `apps/web/sentry.server.config.ts`
- Modify: `apps/worker/src/tcabr_worker/sentry.py`

- [ ] **Step 1: Update `apps/web/sentry.client.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.0,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  sendDefaultPii: false,
  beforeSend(event) {
    // Drop any request cookies entirely on the client.
    if (event.request?.cookies) delete event.request.cookies;
    return event;
  },
});
```

- [ ] **Step 2: Update `apps/web/sentry.server.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request?.cookies) delete event.request.cookies;
    if (event.request?.headers) {
      for (const k of Object.keys(event.request.headers)) {
        if (k.toLowerCase() === "authorization" || k.toLowerCase() === "cookie") {
          delete event.request.headers[k];
        }
      }
    }
    return event;
  },
});
```

- [ ] **Step 3: Update `apps/worker/src/tcabr_worker/sentry.py`**

```python
import os

import sentry_sdk

from .config import settings


def _before_send(event, hint):
    req = event.get("request") or {}
    # Drop any stray tokens
    for key in ("cookies", "headers"):
        if key in req and isinstance(req[key], dict):
            for k in list(req[key].keys()):
                if k.lower() in {"authorization", "cookie"}:
                    req[key].pop(k, None)
    return event


def init_sentry() -> None:
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=0.1,
            release=os.getenv("SENTRY_RELEASE"),
            send_default_pii=False,
            before_send=_before_send,
        )
```

- [ ] **Step 4: Typecheck and commit**

```bash
cd apps/web && pnpm typecheck && cd ../..
git add apps/web/sentry.client.config.ts apps/web/sentry.server.config.ts apps/worker/src/tcabr_worker/sentry.py
git commit -m "feat: Sentry PII scrubbing + release tagging"
```

---

## Task 12: Add exclusions guard to StargazerProfile writes too

**Files:**
- Modify: `apps/worker/src/tcabr_worker/profile_cache.py`

Rationale: even the cached profile row should not be written/updated for excluded users. Minimizes stored PII for opted-out users.

- [ ] **Step 1: Modify `upsert_profile` to no-op for excluded usernames**

```python
# Append to apps/worker/src/tcabr_worker/profile_cache.py

async def upsert_profile_unless_excluded(
    pool: asyncpg.Pool, p: UserProfile
) -> None:
    async with pool.acquire() as c:
        excluded = await c.fetchval(
            "select 1 from user_exclusion where gh_username = $1", p.username
        )
    if excluded:
        return
    await upsert_profile(pool, p)
```

- [ ] **Step 2: Update `apps/worker/src/tcabr_worker/jobs.py` to prefer the guarded upsert**

Replace the `_upsert` helper:

```python
from .profile_cache import upsert_profile_unless_excluded

async def _upsert(pool, profile):
    return await upsert_profile_unless_excluded(pool, profile)
```

- [ ] **Step 3: Extend test**

Append to `apps/worker/tests/test_profile_cache.py`:

```python
@pytest.mark.asyncio
async def test_upsert_skipped_for_excluded(pool: asyncpg.Pool) -> None:
    from tcabr_worker.profile_cache import upsert_profile_unless_excluded

    async with pool.acquire() as c:
        await c.execute(
            "insert into user_exclusion(gh_username) values('testuser_excl') "
            "on conflict do nothing"
        )
    p = UserProfile(
        username="testuser_excl",
        joined_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    await upsert_profile_unless_excluded(pool, p)
    got = await get_cached(pool, "testuser_excl", ttl_days=7)
    assert got is None

    async with pool.acquire() as c:
        await c.execute("delete from user_exclusion where gh_username='testuser_excl'")
```

- [ ] **Step 4: Run and commit**

```bash
cd apps/worker && .venv/bin/pytest tests/test_profile_cache.py -v && cd ../..
git add apps/worker/src/tcabr_worker/profile_cache.py apps/worker/src/tcabr_worker/jobs.py apps/worker/tests/test_profile_cache.py
git commit -m "feat(worker): skip profile upsert for excluded usernames"
```

---

## Task 13: Final sweep

- [ ] **Step 1: Full local test run**

```bash
pnpm --filter @tcabr/shared test
pnpm --filter @tcabr/web test:unit
pnpm --filter @tcabr/web typecheck
pnpm --filter @tcabr/web build
cd apps/worker && .venv/bin/ruff check src tests && .venv/bin/pytest -v && cd ../..
```

Expected: all green.

- [ ] **Step 2: Manual trust-surface walkthrough**

1. Submit a removal request via `/removal`. Confirm `ok:true`.
2. Sign into `/admin/login`. Confirm magic link is printed (dev mailer).
3. Accept the request. Confirm `user_exclusion` row.
4. Scan a repo whose sample includes that username. Confirm it no longer appears in the report gallery.
5. Check Sentry dev mode logs contain no `Cookie` or `Authorization` headers.

- [ ] **Step 3: Commit any final cleanup**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: trust/legal final polish"
```

---

## Self-Review Notes

- **Spec coverage:** Section 7 (Removal page), Section 14 risk mitigations (defamation → removal flow + obscured usernames + transparent disclaimer copy), Section 10 (Sentry observability). Admin path is intentionally simple (email allowlist + magic link) so this plan can ship before the full Supabase OAuth in Plan 4 without duplicating auth infra that will be thrown away.
- **Deferred:** Real ToS/Privacy copy (will come from Termly at launch prep; the stubs from Plan 3 remain). Axiom/Logtail log forwarding (deployment concern). Rate limiting is intentionally minimal (per-username 10-min cooldown on `/api/removal`); upgrade to full IP/global limits once the site is public.
- **Plan 4 handoff:** when the paywall plan lands, the `ObscuredUsername` reveal becomes gated on Pro tier, and the admin allowlist can migrate to Supabase role claims if desired. Neither change touches the trust-surface primitives here.
