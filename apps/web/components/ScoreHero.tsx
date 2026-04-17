export function ScoreHero({
  score,
  ciLow,
  ciHigh,
  sampleSize,
  stargazerTotal,
}: {
  score: number;
  ciLow: number;
  ciHigh: number;
  sampleSize: number;
  stargazerTotal: number;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-baseline gap-3">
        <div className="font-mono text-6xl font-bold tabular-nums">{score}</div>
        <div className="text-sm text-neutral-500">/ 100 anomaly score</div>
      </div>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        95% CI: <span className="font-mono">{ciLow}</span>–<span className="font-mono">{ciHigh}</span>{" "}
        · sampled <span className="font-mono">{sampleSize.toLocaleString()}</span> of{" "}
        <span className="font-mono">{stargazerTotal.toLocaleString()}</span> stargazers
      </p>
    </section>
  );
}
