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
