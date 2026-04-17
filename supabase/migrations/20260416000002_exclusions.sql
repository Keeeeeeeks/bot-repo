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
