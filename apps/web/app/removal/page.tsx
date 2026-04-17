"use client";

import { RemovalForm, type RemovalInput } from "@/components/RemovalForm";
import { COPY } from "@/lib/copy";

export default function RemovalPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold">Request removal</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">{COPY.removalHelp}</p>
      <p className="mt-2 text-sm text-neutral-500">{COPY.removalLegal}</p>
      <div className="mt-8">
        <RemovalForm
          onSubmit={async (input: RemovalInput) => {
            const r = await fetch("/api/removal", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
            });
            if (!r.ok) throw new Error(await r.text());
          }}
        />
      </div>
    </article>
  );
}
