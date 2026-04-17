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
