# To Catch A Bot Repo (TCABR) — Design

**Status:** Draft
**Date:** 2026-04-16
**Owner:** Solo build
**Stance:** B — Hedged framing. Anomaly scores and "atypical profile" labels, never "bot %." Prominent disclaimer. Investigative-analytics, not accusatory.

## 1. Product summary

An investigative-analytics SaaS that ingests any public GitHub repo and produces a shareable "anomaly report" on its stargazers. Surfaces statistical signals (not accusations) that a repo's star growth is atypical. Includes a public leaderboard of "most suspicious growth" and "cleanest organic growth" among trending repos. Solo-built, launched with a hedged/satirical framing, gated by a GitHub-OAuth + Stripe paywall.

## 2. Personas & jobs-to-be-done

- **HN lurker (primary virality driver)** — wants a fun, shareable take on which trending repos look sus.
- **VC analyst** — needs a quick-look signal during due diligence. Will pay.
- **Dev investigating a rival / suspicious repo** — one-off searches. Conversion target for Pro.

## 3. Scope

### MVP (launch)

- On-demand single-repo report (sampled scan, anomaly score, feature breakdown, star time-series chart, stargazer profile gallery).
- Public leaderboard (two lists: "most suspicious" and "cleanest organic"), nightly refresh.
- GitHub OAuth sign-in (required for Pro; anonymous search allowed at free-tier limits).
- Stripe paywall (Free vs Pro $20/mo, $14 launch promo).
- About / ToS / Privacy pages (Termly-generated + custom About).
- Removal-request flow for individual profiles.
- Default-obscured usernames; reveal-on-hover for Pro.
- LLC + disclaimer copy.

### Phase 2 (post-launch TODOs, tracked as issues)

- Full-scan opt-in for Pro users on large repos (async, "report ready in N hours").
- Watchlist + email alerts on anomaly-score changes.
- CSV export.
- Team tier ($50/mo, 5 seats, API + webhooks).
- ML clustering on accumulated data to find behavioral bot clusters.
- **Regression analysis on classifier features** — periodically re-validate which heuristics still discriminate bots vs humans as GitHub account patterns evolve.
- Public API access.
- Slack notifications.

## 4. Architecture

```mermaid
graph TB
    User[User Browser]
    Vercel[Next.js on Vercel<br/>Frontend + API Routes]
    Supabase[(Supabase Postgres<br/>users, repos, snapshots,<br/>classifications, removals)]
    Redis[(Upstash Redis<br/>job queue + hot cache)]
    Worker[Python Worker on Fly.io<br/>scan + classify + snapshot]
    GH[GitHub API]
    Stripe[Stripe Billing]
    Sentry[Sentry]
    Termly[Termly<br/>ToS / PP]

    User --> Vercel
    Vercel --> Supabase
    Vercel --> Redis
    Vercel --> Stripe
    Stripe -->|webhook| Vercel
    Worker --> Redis
    Worker --> Supabase
    Worker --> GH
    Vercel -.->|errors| Sentry
    Worker -.->|errors| Sentry
    Vercel -.->|embeds| Termly
```

## 5. Scan data flow

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Next.js
    participant API as API Routes
    participant DB as Postgres
    participant Q as Redis Queue
    participant W as Python Worker
    participant GH as GitHub API

    U->>FE: Submit repo URL
    FE->>API: POST /api/scan
    API->>DB: Check entitlement + cache freshness
    alt Fresh cache & entitled
        API-->>FE: Cached report
    else Needs scan
        API->>Q: Enqueue scan_repo {user_token?}
        API-->>FE: job_id + poll URL
        W->>Q: Dequeue
        W->>GH: Repo metadata
        W->>GH: Stargazers w/ starred_at (paginated)
        W->>W: Sample 2k if stars > 5k
        loop each stargazer
            W->>DB: Profile cache (7d TTL)
            alt miss
                W->>GH: User profile
                W->>DB: Upsert profile
            end
            W->>W: Apply heuristic features
        end
        W->>W: Compute repo anomaly score + CI
        W->>DB: Write snapshot + classifications
        FE->>API: Poll /api/scan/{job_id}
        API-->>FE: Report JSON
    end
    FE-->>U: Render report
```

## 6. Data model (ERD)

```mermaid
erDiagram
    USER ||--o{ SEARCH : performs
    USER ||--o| SUBSCRIPTION : has
    USER ||--o{ WATCHLIST : owns
    REPO ||--o{ REPO_SNAPSHOT : has
    REPO ||--o{ SEARCH : scanned_in
    REPO ||--o{ WATCHLIST : in
    REPO_SNAPSHOT ||--o{ STARGAZER_CLASSIFICATION : contains
    STARGAZER_PROFILE ||--o{ STARGAZER_CLASSIFICATION : classified_as
    STARGAZER_PROFILE ||--o{ REMOVAL_REQUEST : subject_of

    USER { uuid id PK; text email; text gh_username; text gh_token_encrypted; timestamp created_at }
    SUBSCRIPTION { uuid user_id PK; text stripe_customer_id; text tier; timestamp period_end }
    REPO { uuid id PK; text owner; text name; int star_count; timestamp last_scanned_at }
    REPO_SNAPSHOT { uuid id PK; uuid repo_id FK; int anomaly_score; int sample_size; int stargazer_total; jsonb feature_breakdown; jsonb star_timeseries; timestamp created_at }
    STARGAZER_PROFILE { text username PK; timestamp joined_at; int followers; int following; int public_repos; int recent_commits_60d; jsonb raw; timestamp cached_at }
    STARGAZER_CLASSIFICATION { uuid snapshot_id FK; text username FK; int anomaly_score; jsonb feature_hits; timestamp starred_at }
    SEARCH { uuid id PK; uuid user_id FK; uuid repo_id FK; timestamp created_at }
    WATCHLIST { uuid user_id FK; uuid repo_id FK; timestamp added_at }
    REMOVAL_REQUEST { uuid id PK; text gh_username; text contact_email; text reason; text status; timestamp created_at }
```

## 7. Scoring pipeline

```mermaid
flowchart LR
    A[Stargazer profile] --> B{Feature checks}
    B --> C1[age < 180d +3]
    B --> C2[no commits 60d +2]
    B --> C3[0 followers & following +2]
    B --> C4[empty bio + default avatar +1]
    B --> C5[star-farmer pattern +2]
    B --> C6[bot username regex +2]
    B --> C7[star burst detected +3]
    C1 & C2 & C3 & C4 & C5 & C6 & C7 --> D[Weighted sum]
    D --> E[Normalize 0-100]
    E --> F[Per-user score]
    F --> G[Aggregate across stargazers]
    G --> H[Repo anomaly score + 95% CI]
```

Weights live in a config table and are surfaced transparently in the UI — every anomaly score shows which features contributed. This transparency is the legal armor: "we are not calling them bots, we are showing which public features their profile has."

### Feature definitions (v1)

| Feature | Definition | Weight |
|---|---|---|
| `new_account` | `created_at` within rolling 180 days | +3 |
| `no_recent_commits` | 0 public push events in last 60 days | +2 |
| `zero_social` | followers == 0 AND following == 0 | +2 |
| `sparse_profile` | empty bio AND default avatar | +1 |
| `star_farmer` | >50 stars, starred>10x more than own public repos, stars clustered in bursts | +2 |
| `bot_username` | matches `^[a-z]+-[a-z]+-\d{3,}$` or similar regex set | +2 |
| `star_burst` | user's star on target repo falls within a repo-level burst window (statistical outlier in stars/hour) | +3 |

Max per-user raw score = 15; normalized to 0–100. Repo-level anomaly score = mean(per-user normalized) with 95% bootstrap CI, reported with sample size.

## 8. Key design decisions (rationale)

- **API-only, no scraping** → clean GitHub ToS posture. `starred_at` timestamps from the star-event API give historical velocity free on first scan.
- **OAuth rate-limit pooling** → Pro users use their own 5k/hr quota. A small fallback token pool covers anonymous/free.
- **Sampling default, full-scan premium** → A random sample of 2,000 stargazers gives tight CIs on percentage metrics. Full scan is a Pro opt-in.
- **Heuristics > ML for v1** → Explainable, shippable, defensible. ML clustering is Phase 2 once accumulated data supports it.
- **Transparent feature weights** → "Here is what was flagged" beats "our model says" both legally and in UX.
- **Username obfuscation by default** → reduces doxxing exposure. Pro reveal is a conscious user action; ToS acknowledges.
- **Leaderboard has both lists** → "Cleanest organic growth" is PR armor and serves the VC audience genuinely.

## 9. Full-stack requirements

| Layer | Service | Cost (MVP) |
|---|---|---|
| Frontend hosting | Vercel (Next.js, Hobby → Pro) | $0 → $20/mo |
| DB + Auth + Storage | Supabase (Free → Pro) | $0 → $25/mo |
| Queue + hot cache | Upstash Redis (pay-per-req) | ~$5/mo |
| Worker runtime | Fly.io or Railway (Python) | ~$5–10/mo |
| Payments | Stripe | 2.9% + 30¢ per txn |
| Errors | Sentry (free tier) | $0 |
| Analytics | Plausible or PostHog | $9–14/mo |
| Legal docs | Termly | $10/mo |
| Domain | tocatchabotrepo.com (or similar) | ~$12/yr |
| Entity | Single-member LLC | ~$300–500 one-time + annual fee |
| Registered agent | Northwest / similar | $50–150/yr |

**Baseline operating cost:** ~$60–90/mo + one-time LLC setup. Breakeven ≈ 5 paid Pro users.

## 10. Tech stack

- **Monorepo (pnpm workspaces + Turborepo):**
  - `apps/web` — Next.js 15 App Router, React 19, Tailwind, shadcn/ui, Recharts for time-series.
  - `apps/worker` — Python 3.12, FastAPI (health/admin), `httpx`, `arq` or `rq` for job workers, `pydantic` for models.
  - `packages/shared` — TS types, zod schemas, feature-weight config (JSON source of truth, consumed by both TS and Python).
- **Auth:** Supabase Auth with GitHub OAuth (scopes: `read:user`, `public_repo`).
- **Payments:** Stripe Checkout + Customer Portal; webhooks → Next.js route handler.
- **Encryption:** GitHub tokens encrypted at rest via Supabase Vault or `pgcrypto`.
- **Observability:** Sentry in both apps; structured logs to Axiom or Logtail.
- **CI/CD:** GitHub Actions → Vercel auto-deploy web; Fly.io deploy on main for worker.

## 11. UX surface

1. **Landing (`/`)** — hero: "Is this repo's growth organic?" Single search input. Below: live leaderboard preview.
2. **Report (`/r/:owner/:name`)** — anomaly score hero (big number + CI), feature breakdown bar chart, star-velocity time-series, stargazer gallery (obscured for free, revealed for Pro), share button.
3. **Leaderboard (`/leaderboard`)** — two-column: Most Suspicious / Cleanest. Filters by language, date range, min-stars.
4. **Account (`/account`)** — subscription, watchlist, API key (Phase 2).
5. **About (`/about`)** — custom copy: "This is investigative analysis of public GitHub data. Scores are statistical signals, not verdicts." Explains methodology and weights openly.
6. **ToS / Privacy (`/terms`, `/privacy`)** — Termly-embedded.
7. **Request removal (`/removal`)** — form for individuals to exclude their profile.

## 12. Pricing

- **Free:** 1 search/day, 24h-lagged cache, leaderboard view only (no profile reveals).
- **Pro $20/mo** (launch promo $14/mo = 30% off): unlimited searches, fresh scans, profile reveals, watchlist.
- **Team $50/mo (Phase 2):** 5 seats, API, webhooks.
- Annual: 2 months free (~17% off).

## 13. Testing & launch plan

- **Unit:** feature classifiers (Python, pytest) with golden-profile fixtures.
- **Integration:** scan-job e2e against recorded GitHub responses (`vcrpy`).
- **Smoke:** Playwright on Next.js for paywall gate, search, leaderboard render.
- **Pre-launch:** scan 20 well-known repos by hand, manually sanity-check top-ranked "suspicious" users, tune weights, freeze v1 config.
- **Launch day:** HN + X post linking to a juicy leaderboard entry. Removal-request form live and monitored.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Defamation suit | LLC, hedged framing, transparent features, removal flow, username obfuscation, Termly ToS with indemnification + no-warranty |
| GitHub rate limiting kills UX | OAuth pooling, sampling, 7-day profile cache, nightly pre-compute for leaderboard |
| GitHub ToS change banning this use | API-only, attributable scans via user tokens, removal mechanism |
| Stripe objects to product framing | Frame as "analytics" not "bot detection"; Paddle as contingency |
| Doxxing / harassment of operator | LLC as public-facing entity, domain privacy, registered agent, no personal contact info |
| Misclassified "clean" repo → bad press | Prominent disclaimer, transparent weights, "suggest correction" button, manual review queue |

## 15. Open questions / TODOs

- Final brand/domain acquisition (working name: **To Catch A Bot Repo** / TCABR).
- Exact Termly-generated doc revisions for satirical-analytics positioning.
- Choice of US state for LLC formation (Wyoming vs Delaware vs home state).
- Weight calibration against a hand-labeled set before launch.
- Final leaderboard refresh cadence (nightly vs 6-hourly).
