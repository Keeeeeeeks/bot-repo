import Link from "next/link";
import { SubmitAndNavigate } from "@/components/SubmitAndNavigate";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { fetchLeaderboard } from "@/lib/snapshots";

export default async function Home() {
  const [sus, clean] = await Promise.all([
    fetchLeaderboard("suspicious", 5),
    fetchLeaderboard("clean", 5),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
        Is this repo&apos;s growth organic?
      </h1>
      <p className="mt-4 text-lg text-neutral-600 dark:text-neutral-400">
        Paste any public GitHub repo. We analyze its stargazers against transparent
        heuristics and show you what we found.
      </p>
      <div className="mt-8">
        <SubmitAndNavigate />
      </div>
      <DisclaimerBanner />

      <section className="mt-16 grid gap-8 md:grid-cols-2">
        <LeaderboardPreview title="Most anomalous" rows={sus} />
        <LeaderboardPreview title="Cleanest organic" rows={clean} />
      </section>
      <p className="mt-8 text-sm text-neutral-500">
        <Link href="/leaderboard" className="underline">See the full leaderboard →</Link>
      </p>
    </div>
  );
}

function LeaderboardPreview({
  title,
  rows,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof fetchLeaderboard>>;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.length === 0 && (
          <li className="py-3 text-sm text-neutral-500">No scans yet.</li>
        )}
        {rows.map((r) => (
          <li key={r.repo_id} className="flex items-center justify-between py-3 text-sm">
            <Link href={`/r/${r.owner}/${r.name}`} className="hover:underline">
              {r.owner}/{r.name}
            </Link>
            <span className="font-mono tabular-nums">{r.anomaly_score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
