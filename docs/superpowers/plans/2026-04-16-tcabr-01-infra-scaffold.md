# TCABR Plan 1 — Infra & Monorepo Scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the TCABR monorepo, Supabase schema, shared feature-weight config, Next.js + Python worker skeletons, Redis wiring, Sentry, and CI — so subsequent plans (scan pipeline, web core, trust/legal) drop into a working shell.

**Architecture:** pnpm workspaces + Turborepo at root. `apps/web` is Next.js 15 App Router. `apps/worker` is a Python 3.12 package using `arq` for background jobs against Upstash Redis. `packages/shared` holds the feature-weight JSON (source of truth), mirrored into Postgres at deploy time via a seed script. Supabase Postgres is the primary store; schema lives in `supabase/migrations`.

**Tech Stack:** pnpm, Turborepo, TypeScript 5.5+, Next.js 15, React 19, Tailwind v3, shadcn/ui, Recharts, Python 3.12, uv (package manager), arq, httpx, pydantic v2, pytest, Supabase (Postgres + Auth), Upstash Redis, Sentry, GitHub Actions.

---

## File Structure

Files created by this plan:

```
pnpm-workspace.yaml
package.json
turbo.json
tsconfig.base.json
.nvmrc
.gitignore
.editorconfig
.env.example
README.md

packages/shared/package.json
packages/shared/tsconfig.json
packages/shared/src/index.ts
packages/shared/src/feature-weights.json
packages/shared/src/feature-weights.schema.json
packages/shared/src/types.ts
packages/shared/src/zod-schemas.ts
packages/shared/tests/feature-weights.test.ts

apps/web/package.json
apps/web/next.config.mjs
apps/web/tsconfig.json
apps/web/tailwind.config.ts
apps/web/postcss.config.js
apps/web/app/layout.tsx
apps/web/app/page.tsx
apps/web/app/globals.css
apps/web/lib/supabase.ts
apps/web/lib/redis.ts
apps/web/lib/sentry.ts
apps/web/sentry.client.config.ts
apps/web/sentry.server.config.ts
apps/web/sentry.edge.config.ts
apps/web/instrumentation.ts

apps/worker/pyproject.toml
apps/worker/uv.lock
apps/worker/src/tcabr_worker/__init__.py
apps/worker/src/tcabr_worker/main.py
apps/worker/src/tcabr_worker/config.py
apps/worker/src/tcabr_worker/weights.py
apps/worker/src/tcabr_worker/db.py
apps/worker/src/tcabr_worker/redis_client.py
apps/worker/src/tcabr_worker/sentry.py
apps/worker/tests/conftest.py
apps/worker/tests/test_weights.py
apps/worker/tests/test_health.py

supabase/config.toml
supabase/migrations/20260416000000_init.sql
supabase/migrations/20260416000001_seed_weights_fn.sql
supabase/seed.sql
scripts/seed-weights.ts

.github/workflows/ci.yml
```

---

## Task 1: Initialize git + root config

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `README.md`

- [ ] **Step 1: Confirm git repo exists and is at an empty state**

Run: `git log --oneline | head -5`
Expected: `60394e8 docs: initial TCABR design spec` (the spec commit from brainstorming). Nothing else.

- [ ] **Step 2: Write `.gitignore`**

```gitignore
node_modules/
.next/
.turbo/
dist/
build/
coverage/
.venv/
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/
.env
.env.local
.env.*.local
!.env.example
.DS_Store
*.log
.vercel/
.fly/
supabase/.branches/
supabase/.temp/
```

- [ ] **Step 3: Write `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.py]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Write `.nvmrc`**

```
20
```

- [ ] **Step 5: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 6: Write root `package.json`**

```json
{
  "name": "tcabr",
  "private": true,
  "packageManager": "pnpm@9.10.0",
  "engines": {
    "node": ">=20.11.0"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "format": "prettier --write .",
    "seed:weights": "tsx scripts/seed-weights.ts"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.5.4",
    "prettier": "^3.3.3",
    "tsx": "^4.19.0",
    "@types/node": "^20.14.0"
  }
}
```

- [ ] **Step 7: Write `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 8: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "declaration": true,
    "composite": true,
    "incremental": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 9: Write minimal `README.md`**

```markdown
# TCABR — To Catch A Bot Repo

Investigative-analytics SaaS for GitHub stargazer anomaly detection.

See [design spec](docs/superpowers/specs/2026-04-16-tcabr-design.md) for product scope.

## Structure

- `apps/web` — Next.js 15 frontend + API routes
- `apps/worker` — Python 3.12 scan + scoring worker (arq)
- `packages/shared` — feature-weight config and cross-language types
- `supabase/migrations` — Postgres schema

## Local dev

Prereqs: Node 20+, pnpm 9, Python 3.12+, `uv`, Docker (for Supabase local), `supabase` CLI.

    pnpm install
    supabase start
    pnpm seed:weights
    pnpm dev

## Plans

See `docs/superpowers/plans/`.
```

- [ ] **Step 10: Commit**

```bash
git add pnpm-workspace.yaml package.json turbo.json tsconfig.base.json .nvmrc .gitignore .editorconfig README.md
git commit -m "chore: scaffold monorepo root (pnpm + turbo + tsconfig)"
```

---

## Task 2: packages/shared — feature-weight config as source of truth

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/feature-weights.json`
- Create: `packages/shared/src/feature-weights.schema.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/zod-schemas.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/feature-weights.test.ts`

- [ ] **Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "@tcabr/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "ajv": "^8.17.1",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `packages/shared/src/feature-weights.json` (source of truth)**

```json
{
  "version": 1,
  "updated_at": "2026-04-16",
  "normalization": { "max_raw": 15, "scale": 100 },
  "features": [
    { "id": "new_account", "weight": 3, "description": "created_at within rolling 180 days" },
    { "id": "no_recent_commits", "weight": 2, "description": "0 public push events in last 60 days" },
    { "id": "zero_social", "weight": 2, "description": "followers == 0 AND following == 0" },
    { "id": "sparse_profile", "weight": 1, "description": "empty bio AND default avatar" },
    { "id": "star_farmer", "weight": 2, "description": ">50 stars, stars >>10x own public repos, clustered in bursts" },
    { "id": "bot_username", "weight": 2, "description": "matches known bot username regex set" },
    { "id": "star_burst", "weight": 3, "description": "star on target repo falls within repo-level burst window" }
  ]
}
```

- [ ] **Step 4: Write `packages/shared/src/feature-weights.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "FeatureWeightsConfig",
  "type": "object",
  "required": ["version", "updated_at", "normalization", "features"],
  "properties": {
    "version": { "type": "integer", "minimum": 1 },
    "updated_at": { "type": "string", "format": "date" },
    "normalization": {
      "type": "object",
      "required": ["max_raw", "scale"],
      "properties": {
        "max_raw": { "type": "integer", "minimum": 1 },
        "scale": { "type": "integer", "const": 100 }
      }
    },
    "features": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "weight", "description"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z_]+$" },
          "weight": { "type": "integer", "minimum": 0, "maximum": 10 },
          "description": { "type": "string", "minLength": 5 }
        }
      }
    }
  }
}
```

- [ ] **Step 5: Write `packages/shared/src/types.ts`**

```typescript
export type FeatureId =
  | "new_account"
  | "no_recent_commits"
  | "zero_social"
  | "sparse_profile"
  | "star_farmer"
  | "bot_username"
  | "star_burst";

export interface FeatureWeight {
  id: FeatureId;
  weight: number;
  description: string;
}

export interface FeatureWeightsConfig {
  version: number;
  updated_at: string;
  normalization: { max_raw: number; scale: number };
  features: FeatureWeight[];
}

export interface FeatureHit {
  id: FeatureId;
  triggered: boolean;
  weight: number;
}

export type SubscriptionTier = "free" | "pro" | "team";
```

- [ ] **Step 6: Write `packages/shared/src/zod-schemas.ts`**

```typescript
import { z } from "zod";

export const FeatureIdSchema = z.enum([
  "new_account",
  "no_recent_commits",
  "zero_social",
  "sparse_profile",
  "star_farmer",
  "bot_username",
  "star_burst",
]);

export const FeatureWeightSchema = z.object({
  id: FeatureIdSchema,
  weight: z.number().int().min(0).max(10),
  description: z.string().min(5),
});

export const FeatureWeightsConfigSchema = z.object({
  version: z.number().int().min(1),
  updated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  normalization: z.object({
    max_raw: z.number().int().min(1),
    scale: z.literal(100),
  }),
  features: z.array(FeatureWeightSchema).min(1),
});

export const RepoRefSchema = z.object({
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
});

export type RepoRef = z.infer<typeof RepoRefSchema>;
```

- [ ] **Step 7: Write `packages/shared/src/index.ts`**

```typescript
import weights from "./feature-weights.json" with { type: "json" };
import { FeatureWeightsConfigSchema } from "./zod-schemas";
import type { FeatureWeightsConfig } from "./types";

export * from "./types";
export * from "./zod-schemas";

export const FEATURE_WEIGHTS: FeatureWeightsConfig =
  FeatureWeightsConfigSchema.parse(weights);
```

- [ ] **Step 8: Write failing test `packages/shared/tests/feature-weights.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import weights from "../src/feature-weights.json";
import schema from "../src/feature-weights.schema.json";
import { FEATURE_WEIGHTS } from "../src/index";

describe("feature-weights.json", () => {
  it("matches its JSON Schema", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    expect(validate(weights)).toBe(true);
  });

  it("sum of weights equals normalization.max_raw", () => {
    const sum = FEATURE_WEIGHTS.features.reduce((a, f) => a + f.weight, 0);
    expect(sum).toBe(FEATURE_WEIGHTS.normalization.max_raw);
  });

  it("has no duplicate feature ids", () => {
    const ids = FEATURE_WEIGHTS.features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 9: Install deps and run test, verify it passes**

```bash
pnpm install
pnpm --filter @tcabr/shared test
```

Expected: 3 tests pass. If sum assertion fails, the JSON is the bug — it is authored so 3+2+2+1+2+2+3=15 matches `max_raw`.

- [ ] **Step 10: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): feature-weight config with JSON Schema + zod types"
```

---

## Task 3: Supabase local setup + init migration

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/20260416000000_init.sql`
- Create: `supabase/seed.sql`

- [ ] **Step 1: Initialize Supabase project**

```bash
supabase init
```

This generates `supabase/config.toml`. Open it and ensure:

```toml
project_id = "tcabr"

[api]
port = 54321

[db]
port = 54322
major_version = 15

[studio]
port = 54323
```

- [ ] **Step 2: Write `supabase/migrations/20260416000000_init.sql`**

```sql
-- tcabr init schema
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

create type subscription_tier as enum ('free', 'pro', 'team');
create type removal_status    as enum ('open', 'accepted', 'rejected');

create table app_user (
  id           uuid primary key default gen_random_uuid(),
  email        text unique,
  gh_username  text unique,
  gh_token_enc bytea,
  created_at   timestamptz not null default now()
);

create table subscription (
  user_id            uuid primary key references app_user(id) on delete cascade,
  stripe_customer_id text unique,
  tier               subscription_tier not null default 'free',
  period_end         timestamptz
);

create table repo (
  id              uuid primary key default gen_random_uuid(),
  owner           text not null,
  name            text not null,
  star_count      integer not null default 0,
  last_scanned_at timestamptz,
  unique (owner, name)
);

create table stargazer_profile (
  username         text primary key,
  joined_at        timestamptz,
  followers        integer not null default 0,
  following        integer not null default 0,
  public_repos     integer not null default 0,
  recent_commits_60d integer not null default 0,
  raw              jsonb not null default '{}'::jsonb,
  cached_at        timestamptz not null default now()
);

create table repo_snapshot (
  id                uuid primary key default gen_random_uuid(),
  repo_id           uuid not null references repo(id) on delete cascade,
  anomaly_score     integer not null,
  score_ci_low      integer not null,
  score_ci_high     integer not null,
  sample_size       integer not null,
  stargazer_total   integer not null,
  feature_breakdown jsonb not null,
  star_timeseries   jsonb not null,
  burst_windows     jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);
create index repo_snapshot_repo_created_idx on repo_snapshot(repo_id, created_at desc);

create table stargazer_classification (
  snapshot_id   uuid not null references repo_snapshot(id) on delete cascade,
  username      text not null references stargazer_profile(username) on delete cascade,
  anomaly_score integer not null,
  feature_hits  jsonb not null,
  starred_at    timestamptz not null,
  primary key (snapshot_id, username)
);
create index stargazer_class_snapshot_idx on stargazer_classification(snapshot_id);

create table search (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references app_user(id) on delete set null,
  repo_id    uuid not null references repo(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index search_user_created_idx on search(user_id, created_at desc);

create table watchlist (
  user_id  uuid not null references app_user(id) on delete cascade,
  repo_id  uuid not null references repo(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, repo_id)
);

create table removal_request (
  id            uuid primary key default gen_random_uuid(),
  gh_username   text not null,
  contact_email text,
  reason        text,
  status        removal_status not null default 'open',
  created_at    timestamptz not null default now()
);
create index removal_username_idx on removal_request(gh_username);

create table feature_weight (
  id          text primary key,
  weight      integer not null,
  description text not null,
  updated_at  timestamptz not null default now()
);

create table feature_weights_meta (
  version     integer primary key,
  max_raw     integer not null,
  scale       integer not null default 100,
  updated_at  timestamptz not null default now()
);
```

- [ ] **Step 3: Write empty `supabase/seed.sql`**

```sql
-- Seed is handled by scripts/seed-weights.ts (TS is source of truth for weights).
-- This file intentionally left empty so `supabase db reset` does not clobber weights.
```

- [ ] **Step 4: Start Supabase locally and apply migration**

```bash
supabase start
supabase db reset
```

Expected: migration applies cleanly, studio reachable at http://localhost:54323.

- [ ] **Step 5: Verify schema with psql**

```bash
supabase db inspect
```

Expected output lists all tables including `repo_snapshot`, `stargazer_classification`, `feature_weight`.

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat(db): initial Supabase schema (users, repos, snapshots, classifications, removals, weights)"
```

---

## Task 4: Weight seed script

**Files:**
- Create: `scripts/seed-weights.ts`
- Modify: root `package.json` (script already added in Task 1)

- [ ] **Step 1: Add deps to root `package.json` devDependencies**

```bash
pnpm add -D -w postgres
```

Expected: `postgres` (the `porsager/postgres` driver) added to devDependencies.

- [ ] **Step 2: Write `scripts/seed-weights.ts`**

```typescript
import postgres from "postgres";
import { FEATURE_WEIGHTS } from "@tcabr/shared";

const url = process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function main() {
  const sql = postgres(url, { onnotice: () => {} });

  await sql.begin(async (tx) => {
    await tx`
      insert into feature_weights_meta (version, max_raw, scale, updated_at)
      values (${FEATURE_WEIGHTS.version},
              ${FEATURE_WEIGHTS.normalization.max_raw},
              ${FEATURE_WEIGHTS.normalization.scale},
              now())
      on conflict (version) do update
        set max_raw = excluded.max_raw,
            scale = excluded.scale,
            updated_at = now();
    `;
    for (const f of FEATURE_WEIGHTS.features) {
      await tx`
        insert into feature_weight (id, weight, description, updated_at)
        values (${f.id}, ${f.weight}, ${f.description}, now())
        on conflict (id) do update
          set weight = excluded.weight,
              description = excluded.description,
              updated_at = now();
      `;
    }
  });

  const rows = await sql`select id, weight from feature_weight order by id`;
  console.log(`seeded ${rows.length} feature weights`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Run the script**

```bash
pnpm seed:weights
```

Expected: `seeded 7 feature weights`.

- [ ] **Step 4: Verify in DB**

```bash
supabase db inspect --linked=false | head -40
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, weight from feature_weight order by weight desc;"
```

Expected: 7 rows, weights summing to 15.

- [ ] **Step 5: Commit**

```bash
git add scripts/ package.json pnpm-lock.yaml
git commit -m "feat(db): seed script mirrors shared weight JSON into feature_weight table"
```

---

## Task 5: apps/web — Next.js scaffold

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/.env.local.example`

- [ ] **Step 1: Write `apps/web/package.json`**

```json
{
  "name": "@tcabr/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@tcabr/shared": "workspace:*",
    "@supabase/supabase-js": "^2.45.0",
    "@upstash/redis": "^1.34.0",
    "next": "15.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "zod": "^3.23.8",
    "@sentry/nextjs": "^8.26.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.9.0",
    "eslint-config-next": "15.0.0",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write `apps/web/next.config.mjs`**

```javascript
import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@tcabr/shared"],
  experimental: { instrumentationHook: true },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
```

- [ ] **Step 3: Write `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] },
    "noEmit": true,
    "composite": false
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `apps/web/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Write `apps/web/postcss.config.js`**

```javascript
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 6: Write `apps/web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: light dark; }
body { @apply bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100; }
```

- [ ] **Step 7: Write `apps/web/app/layout.tsx`**

```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "To Catch A Bot Repo",
  description: "Is this repo's growth organic? Investigative analytics for GitHub stargazers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Write `apps/web/app/page.tsx` (placeholder landing)**

```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight">To Catch A Bot Repo</h1>
      <p className="mt-4 text-lg text-neutral-600 dark:text-neutral-400">
        Is this repo&apos;s growth organic?
      </p>
      <p className="mt-2 text-sm text-neutral-500">
        Scaffold only. Real landing + search form lands in plan 3 (web core).
      </p>
    </main>
  );
}
```

- [ ] **Step 9: Write `apps/web/.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...local-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJ...local-service-role-key
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
```

- [ ] **Step 10: Install and run dev server**

```bash
pnpm install
pnpm --filter @tcabr/web dev
```

Expected: Next.js starts on :3000, landing page renders the headline.

Stop it (Ctrl+C) before continuing.

- [ ] **Step 11: Commit**

```bash
git add apps/web/ pnpm-lock.yaml
git commit -m "feat(web): Next.js 15 scaffold with Tailwind + shared package link"
```

---

## Task 6: apps/web — Supabase + Redis + Sentry wiring

**Files:**
- Create: `apps/web/lib/supabase.ts`
- Create: `apps/web/lib/redis.ts`
- Create: `apps/web/lib/sentry.ts`
- Create: `apps/web/sentry.client.config.ts`
- Create: `apps/web/sentry.server.config.ts`
- Create: `apps/web/sentry.edge.config.ts`
- Create: `apps/web/instrumentation.ts`

- [ ] **Step 1: Write `apps/web/lib/supabase.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabasePublic = createClient(url, anonKey, {
  auth: { persistSession: false },
});

export function supabaseService() {
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
```

- [ ] **Step 2: Write `apps/web/lib/redis.ts`**

```typescript
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const JOB_QUEUE_KEY = "tcabr:scan:queue";
export const jobStatusKey = (id: string) => `tcabr:scan:status:${id}`;
```

- [ ] **Step 3: Write `apps/web/sentry.client.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.0,
});
```

- [ ] **Step 4: Write `apps/web/sentry.server.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
```

- [ ] **Step 5: Write `apps/web/sentry.edge.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
```

- [ ] **Step 6: Write `apps/web/instrumentation.ts`**

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
```

- [ ] **Step 7: Write `apps/web/lib/sentry.ts` (explicit error helper)**

```typescript
import * as Sentry from "@sentry/nextjs";

export function captureError(err: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(err, { extra: context });
}
```

- [ ] **Step 8: Typecheck**

```bash
pnpm --filter @tcabr/web typecheck
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "feat(web): wire Supabase, Upstash Redis, and Sentry clients"
```

---

## Task 7: apps/worker — Python scaffold with uv + arq + pytest

**Files:**
- Create: `apps/worker/pyproject.toml`
- Create: `apps/worker/src/tcabr_worker/__init__.py`
- Create: `apps/worker/src/tcabr_worker/config.py`
- Create: `apps/worker/src/tcabr_worker/main.py`
- Create: `apps/worker/src/tcabr_worker/weights.py`
- Create: `apps/worker/src/tcabr_worker/db.py`
- Create: `apps/worker/src/tcabr_worker/redis_client.py`
- Create: `apps/worker/src/tcabr_worker/sentry.py`
- Create: `apps/worker/.env.example`
- Create: `apps/worker/tests/conftest.py`

- [ ] **Step 1: Write `apps/worker/pyproject.toml`**

```toml
[project]
name = "tcabr-worker"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "arq>=0.26.1",
  "httpx>=0.27.0",
  "pydantic>=2.8.0",
  "pydantic-settings>=2.4.0",
  "asyncpg>=0.29.0",
  "sentry-sdk>=2.13.0",
  "structlog>=24.4.0",
  "redis>=5.0.8"
]

[project.optional-dependencies]
dev = [
  "pytest>=8.3.2",
  "pytest-asyncio>=0.23.8",
  "vcrpy>=6.0.1",
  "ruff>=0.6.0",
  "mypy>=1.11.0"
]

[tool.hatch.build.targets.wheel]
packages = ["src/tcabr_worker"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"
```

- [ ] **Step 2: Initialize uv and install**

```bash
cd apps/worker
uv venv
uv pip install -e ".[dev]"
cd ../..
```

Expected: `.venv/` created inside `apps/worker/`, all deps resolved.

- [ ] **Step 3: Write `apps/worker/src/tcabr_worker/__init__.py`**

```python
__version__ = "0.1.0"
```

- [ ] **Step 4: Write `apps/worker/src/tcabr_worker/config.py`**

```python
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(
        default="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    )
    redis_url: str = Field(default="redis://127.0.0.1:6379")
    github_fallback_token: str | None = None
    sentry_dsn: str | None = None
    sample_size_default: int = 2000
    sample_threshold: int = 5000
    profile_cache_ttl_days: int = 7


settings = Settings()
```

- [ ] **Step 5: Write `apps/worker/src/tcabr_worker/weights.py` (reads same JSON)**

```python
import json
from pathlib import Path
from typing import Literal, TypedDict

FeatureId = Literal[
    "new_account",
    "no_recent_commits",
    "zero_social",
    "sparse_profile",
    "star_farmer",
    "bot_username",
    "star_burst",
]


class FeatureWeight(TypedDict):
    id: FeatureId
    weight: int
    description: str


class Normalization(TypedDict):
    max_raw: int
    scale: int


class FeatureWeightsConfig(TypedDict):
    version: int
    updated_at: str
    normalization: Normalization
    features: list[FeatureWeight]


_JSON_PATH = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "shared"
    / "src"
    / "feature-weights.json"
)


def load_weights() -> FeatureWeightsConfig:
    with _JSON_PATH.open("r") as f:
        return json.load(f)


WEIGHTS: FeatureWeightsConfig = load_weights()
```

- [ ] **Step 6: Write `apps/worker/src/tcabr_worker/db.py`**

```python
from __future__ import annotations

import asyncpg

from .config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
```

- [ ] **Step 7: Write `apps/worker/src/tcabr_worker/redis_client.py`**

```python
from redis.asyncio import Redis

from .config import settings


def make_redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)
```

- [ ] **Step 8: Write `apps/worker/src/tcabr_worker/sentry.py`**

```python
import sentry_sdk

from .config import settings


def init_sentry() -> None:
    if settings.sentry_dsn:
        sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.1)
```

- [ ] **Step 9: Write `apps/worker/src/tcabr_worker/main.py` (arq WorkerSettings + health)**

```python
from __future__ import annotations

from arq.connections import RedisSettings

from .config import settings
from .sentry import init_sentry


async def startup(ctx: dict) -> None:
    init_sentry()
    ctx["started"] = True


async def shutdown(ctx: dict) -> None:
    pass


async def health(ctx: dict) -> dict[str, str]:
    return {"status": "ok"}


class WorkerSettings:
    functions = [health]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 4
```

- [ ] **Step 10: Write `apps/worker/.env.example`**

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
REDIS_URL=redis://127.0.0.1:6379
GITHUB_FALLBACK_TOKEN=
SENTRY_DSN=
```

- [ ] **Step 11: Write `apps/worker/tests/conftest.py`**

```python
import pytest


@pytest.fixture
def dummy_ctx() -> dict:
    return {"started": True}
```

- [ ] **Step 12: Write failing test `apps/worker/tests/test_weights.py`**

```python
from tcabr_worker.weights import WEIGHTS


def test_weights_load() -> None:
    assert WEIGHTS["version"] >= 1
    ids = [f["id"] for f in WEIGHTS["features"]]
    assert len(set(ids)) == len(ids)


def test_weights_sum_matches_max_raw() -> None:
    total = sum(f["weight"] for f in WEIGHTS["features"])
    assert total == WEIGHTS["normalization"]["max_raw"]
```

- [ ] **Step 13: Write failing test `apps/worker/tests/test_health.py`**

```python
import pytest

from tcabr_worker.main import health


@pytest.mark.asyncio
async def test_health_returns_ok(dummy_ctx: dict) -> None:
    assert await health(dummy_ctx) == {"status": "ok"}
```

- [ ] **Step 14: Run tests, confirm pass**

```bash
cd apps/worker
.venv/bin/pytest -v
cd ../..
```

Expected: 3 tests pass (test_weights_load, test_weights_sum_matches_max_raw, test_health_returns_ok).

- [ ] **Step 15: Commit**

```bash
git add apps/worker/
git commit -m "feat(worker): Python scaffold with arq, pytest, shared-weight loader"
```

---

## Task 8: Removal migration + second migration file

**Files:**
- Create: `supabase/migrations/20260416000001_seed_weights_fn.sql`

- [ ] **Step 1: Write `supabase/migrations/20260416000001_seed_weights_fn.sql`**

```sql
-- Helper view: current anomaly score per repo (latest snapshot).
create or replace view repo_current_score as
select distinct on (r.id)
  r.id           as repo_id,
  r.owner,
  r.name,
  r.star_count,
  s.anomaly_score,
  s.score_ci_low,
  s.score_ci_high,
  s.sample_size,
  s.stargazer_total,
  s.created_at   as snapshot_created_at
from repo r
join repo_snapshot s on s.repo_id = r.id
order by r.id, s.created_at desc;
```

- [ ] **Step 2: Apply migration**

```bash
supabase db reset
pnpm seed:weights
```

Expected: both migrations apply, weights re-seeded.

- [ ] **Step 3: Verify view works**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select count(*) from repo_current_score;"
```

Expected: `0` (no repos yet, but view exists).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): repo_current_score view for leaderboard queries"
```

---

## Task 9: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  node:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.10.0 }
      - uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @tcabr/shared test
      - run: pnpm --filter @tcabr/web typecheck
      - run: pnpm --filter @tcabr/web build
        env:
          NEXT_PUBLIC_SUPABASE_URL: http://placeholder
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder
          UPSTASH_REDIS_REST_URL: http://placeholder
          UPSTASH_REDIS_REST_TOKEN: placeholder

  python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - name: Setup Python
        run: uv python install 3.12
      - name: Install worker
        working-directory: apps/worker
        run: |
          uv venv
          uv pip install -e ".[dev]"
      - name: Ruff
        working-directory: apps/worker
        run: .venv/bin/ruff check src tests
      - name: Pytest
        working-directory: apps/worker
        run: .venv/bin/pytest -v
```

- [ ] **Step 2: Run locally to verify lint passes**

```bash
cd apps/worker && .venv/bin/ruff check src tests && cd ../..
pnpm --filter @tcabr/shared test
pnpm --filter @tcabr/web typecheck
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: lint + typecheck + test on node and python"
```

---

## Task 10: Root .env.example + final smoke test

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Write root `.env.example`**

```
# ---- Supabase (local) ----
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# ---- Redis (Upstash) ----
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
REDIS_URL=redis://127.0.0.1:6379

# ---- GitHub (fallback token for anon scans) ----
GITHUB_FALLBACK_TOKEN=

# ---- Sentry ----
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
```

- [ ] **Step 2: Full smoke run**

```bash
supabase start
supabase db reset
pnpm install --frozen-lockfile
pnpm seed:weights
pnpm --filter @tcabr/shared test
pnpm --filter @tcabr/web typecheck
pnpm --filter @tcabr/web build
cd apps/worker && .venv/bin/pytest && cd ../..
```

Expected: every command exits 0.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: document required environment variables"
```

---

## Self-Review Notes

- **Spec coverage (this plan):** monorepo scaffold ✓, Supabase schema incl. all ERD tables ✓, feature-weight JSON as source-of-truth + DB-authoritative at runtime (advisory note #4) ✓, composite PK on `stargazer_classification` (advisory #3) ✓, Python worker skeleton ✓, Redis wiring ✓, Sentry ✓, CI ✓. Advisory notes #1 (per-tier cache freshness) and #2 (star_burst as repo-level pre-pass) are implemented in Plan 2 and Plan 3 respectively.
- **Deferred to later plans:** actual scan/scoring logic (Plan 2), all UI beyond the placeholder landing (Plan 3), auth + Stripe (Plan 4, not in this batch), removal-request UI + obfuscation component (Plan 5).
- **Post-merge:** provision Upstash Redis and Sentry projects and paste the real values into Vercel env vars before deploying.
