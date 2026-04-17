"use client";

import { useState } from "react";

export interface RemovalReq {
  id: string;
  gh_username: string;
  contact_email: string | null;
  reason: string | null;
  status: "open" | "accepted" | "rejected";
  created_at: string;
}

export function AdminQueueRow({ req }: { req: RemovalReq }) {
  const [status, setStatus] = useState(req.status);
  const [busy, setBusy] = useState(false);

  async function act(action: "accept" | "reject") {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/removal/${req.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!r.ok) throw new Error(await r.text());
      setStatus(action === "accept" ? "accepted" : "rejected");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div>
        <div className="font-mono text-sm">{req.gh_username}</div>
        <div className="text-xs text-neutral-500">
          {new Date(req.created_at).toUTCString()}
          {req.contact_email ? ` · ${req.contact_email}` : ""}
        </div>
        {req.reason && <div className="mt-1 max-w-lg text-sm text-neutral-600 dark:text-neutral-400">{req.reason}</div>}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide dark:bg-neutral-800">{status}</span>
        {status === "open" && (
          <>
            <button disabled={busy} onClick={() => act("accept")} className="rounded-md bg-green-600 px-3 py-1 text-white disabled:opacity-50">Accept</button>
            <button disabled={busy} onClick={() => act("reject")} className="rounded-md border px-3 py-1 dark:border-neutral-700">Reject</button>
          </>
        )}
      </div>
    </li>
  );
}
