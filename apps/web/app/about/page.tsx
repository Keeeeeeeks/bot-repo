import { FEATURE_WEIGHTS } from "@tcabr/shared";

export default function About() {
  return (
    <article className="prose mx-auto max-w-2xl px-6 py-12 dark:prose-invert">
      <h1>How TCABR works</h1>
      <p>
        TCABR reads public GitHub data (repo metadata, stargazer timestamps, public user
        profiles) and computes an <strong>anomaly score</strong> for each repo&apos;s stargazer
        sample.
      </p>
      <p>
        Scores are statistical signals — not accusations or verdicts. Every score is
        transparent: we show exactly which features contributed and how much.
      </p>
      <h2>The features</h2>
      <ul>
        {FEATURE_WEIGHTS.features.map((f) => (
          <li key={f.id}>
            <code>{f.id}</code> (weight {f.weight}) — {f.description}
          </li>
        ))}
      </ul>
      <h2>Sampling</h2>
      <p>
        Repos with more than 5,000 stars are analyzed via a random sample of 2,000 stargazers.
        The report includes a 95% bootstrap confidence interval so you can judge precision.
      </p>
      <h2>What this is not</h2>
      <p>
        This is investigative analysis of public data, presented for informational and
        satirical purposes. It does not label individuals as bots, and no individual profile
        data is redistributed. See our <a href="/terms">Terms</a> and <a href="/privacy">Privacy</a>.
      </p>
    </article>
  );
}
