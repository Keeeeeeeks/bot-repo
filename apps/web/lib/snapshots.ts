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
