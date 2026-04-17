"use client";

import { useState } from "react";
import { parseRepoRef, RepoRefError } from "@/lib/repo-ref";
import type { RepoRef } from "@tcabr/shared";

export function SearchForm({
  onSubmit,
}: {
  onSubmit: (ref: RepoRef) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const ref = parseRepoRef(value);
          setSubmitting(true);
          await onSubmit(ref);
        } catch (err) {
          if (err instanceof RepoRefError) setError(err.message);
          else setError("something went wrong");
        } finally {
          setSubmitting(false);
        }
      }}
      className="flex flex-col gap-2 md:flex-row md:items-stretch"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="owner/name or github.com URL"
        className="flex-1 rounded-md border border-neutral-300 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={submitting || !value.trim()}
        className="rounded-md bg-neutral-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {submitting ? "Scanning..." : "Scan"}
      </button>
      {error && (
        <div role="alert" className="text-sm text-red-600 md:basis-full">
          {error}
        </div>
      )}
    </form>
  );
}
