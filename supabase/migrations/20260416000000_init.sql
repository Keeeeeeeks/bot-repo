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
