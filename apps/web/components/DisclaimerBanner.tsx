export function DisclaimerBanner() {
  return (
    <aside className="mx-auto mt-6 max-w-3xl rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
      <strong>Heads up:</strong> anomaly scores highlight <em>atypical</em> stargazer-profile patterns
      in public GitHub data. They are not accusations. See{" "}
      <a href="/about" className="underline">how this works</a>.
    </aside>
  );
}
