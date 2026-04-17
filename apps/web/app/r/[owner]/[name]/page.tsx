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
