"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function PendingPoller({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [state, setState] = useState<string>("queued");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await fetch(`/api/scan/${jobId}`);
      if (!alive) return;
      if (!r.ok) {
        setErr("could not poll job");
        return;
      }
      const j = await r.json() as { state: string; error?: string };
      setState(j.state);
      if (j.state === "done") {
        router.refresh();
      } else if (j.state === "error") {
        setErr(j.error ?? "scan failed");
      } else {
        setTimeout(tick, 2000);
      }
    };
    tick();
    return () => { alive = false; };
  }, [jobId, router]);

  if (err) return <div role="alert" className="text-red-600">Error: {err}</div>;
  return (
    <div className="rounded-md border border-neutral-200 p-6 text-sm dark:border-neutral-800">
      <p className="font-medium">Scan {state}…</p>
      <p className="mt-1 text-neutral-500">This page will auto-refresh when the report is ready.</p>
    </div>
  );
}
