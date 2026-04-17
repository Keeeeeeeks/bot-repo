"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function StarTimeSeries({ data }: { data: { date: string; n: number }[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Star velocity</h2>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={32} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="n" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
