import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-neutral-200 py-8 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 md:flex-row md:items-center md:justify-between">
        <p>TCABR analyzes public GitHub data. Scores are statistical signals, not verdicts.</p>
        <nav className="flex gap-4">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/removal">Request removal</Link>
        </nav>
      </div>
    </footer>
  );
}
