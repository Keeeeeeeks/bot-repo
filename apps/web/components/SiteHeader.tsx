import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold">
          <span aria-hidden>🫣</span> To Catch A Bot Repo
        </Link>
        <nav className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/about">About</Link>
        </nav>
      </div>
    </header>
  );
}
