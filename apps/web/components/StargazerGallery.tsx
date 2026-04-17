import { ObscuredUsername } from "./ObscuredUsername";

export interface StargazerRow {
  username: string;
  anomaly_score: number;
  top_features: string[];
}

export function StargazerGallery({
  rows,
  reveal = false,
}: {
  rows: StargazerRow[];
  reveal?: boolean;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Top flagged stargazers</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Usernames are obscured by default. Pro subscribers can reveal them. Signals only — not verdicts.
      </p>
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          >
            <div className="flex items-center gap-3">
              <ObscuredUsername username={r.username} reveal={reveal} />
              <div className="text-xs text-neutral-500">{r.top_features.join(", ")}</div>
            </div>
            <span className="font-mono text-sm tabular-nums">{r.anomaly_score}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
