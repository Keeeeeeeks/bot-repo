import Link from "next/link";
import type { LatestSnapshot } from "@/lib/snapshots";

export function LeaderboardTable({ rows }: { rows: LatestSnapshot[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">No scans yet.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-neutral-500">
          <th className="py-2">Repo</th>
          <th className="py-2 text-right">Stars</th>
          <th className="py-2 text-right">Score</th>
          <th className="py-2 text-right">CI</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.repo_id} className="border-b last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-900">
            <td className="py-2">
              <Link href={`/r/${r.owner}/${r.name}`} className="hover:underline">
                {r.owner}/{r.name}
              </Link>
            </td>
            <td className="py-2 text-right font-mono tabular-nums">{r.star_count.toLocaleString()}</td>
            <td className="py-2 text-right font-mono text-base tabular-nums">{r.anomaly_score}</td>
            <td className="py-2 text-right font-mono text-xs text-neutral-500">
              {r.score_ci_low}–{r.score_ci_high}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
