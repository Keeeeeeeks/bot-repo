"use client";

import { useState } from "react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await fetch("/api/admin/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setSent(true);
      }}
      className="space-y-3"
    >
      <label htmlFor="email" className="block text-sm font-medium">Admin email</label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button type="submit" className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900">
        Send magic link
      </button>
      {sent && <p className="text-sm text-neutral-500">If that address is on the allowlist, a link has been sent.</p>}
    </form>
  );
}
