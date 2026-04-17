"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FEATURE_WEIGHTS } from "@tcabr/shared";

export function FeatureBreakdown({
  breakdown,
  sampleSize,
}: {
  breakdown: Record<string, number>;
  sampleSize: number;
}) {
  const data = FEATURE_WEIGHTS.features.map((f) => ({
    id: f.id,
    label: f.id.replace(/_/g, " "),
    hits: breakdown[f.id] ?? 0,
    percent: sampleSize > 0 ? Math.round((100 * (breakdown[f.id] ?? 0)) / sampleSize) : 0,
    weight: f.weight,
    description: f.description,
  }));
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Feature breakdown</h2>
      <p className="mt-1 text-sm text-neutral-500">
        % of sampled stargazers whose profile triggered each signal. Higher weight = higher contribution to the anomaly score.
      </p>
      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 16, right: 24 }}>
            <XAxis type="number" domain={[0, 100]} unit="%" />
            <YAxis type="category" dataKey="label" width={130} />
            <Tooltip
              formatter={(_v, _n, { payload }) => [
                `${payload.percent}% (${payload.hits} of ${sampleSize})`,
                `weight ${payload.weight}`,
              ]}
              labelFormatter={(l) => l}
            />
            <Bar dataKey="percent" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
