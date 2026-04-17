"use client";

import { useRouter } from "next/navigation";
import { SearchForm } from "@/components/SearchForm";

export function SubmitAndNavigate() {
  const router = useRouter();
  return (
    <SearchForm
      onSubmit={async (ref) => {
        const resp = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: `${ref.owner}/${ref.name}` }),
        });
        const data = await resp.json() as { error?: string; cached?: boolean; report_url?: string; job_id?: string };
        if (!resp.ok) throw new Error(data.error ?? "scan failed");
        if (data.cached) {
          router.push(data.report_url ?? `/r/${ref.owner}/${ref.name}`);
          return;
        }
        router.push(`/r/${ref.owner}/${ref.name}?pending=${data.job_id}`);
      }}
    />
  );
}
