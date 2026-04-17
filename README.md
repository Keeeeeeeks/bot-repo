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
