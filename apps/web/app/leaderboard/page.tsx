import { fetchLeaderboard } from "@/lib/snapshots";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Leaderboard() {
  const [sus, clean] = await Promise.all([
    fetchLeaderboard("suspicious", 25),
    fetchLeaderboard("clean", 25),
  ]);
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-bold">Leaderboard</h1>
      <DisclaimerBanner />
      <section className="mt-8 grid gap-12 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Most anomalous growth</h2>
          <LeaderboardTable rows={sus} />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Cleanest organic growth</h2>
          <LeaderboardTable rows={clean} />
        </div>
      </section>
    </div>
  );
}
