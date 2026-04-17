export const COPY = {
  disclaimerShort:
    "TCABR analyzes public GitHub data. Anomaly scores highlight atypical stargazer-profile patterns. They are signals, not verdicts.",
  disclaimerLong:
    "Every score on this site is computed from public GitHub profile data using transparent, weighted heuristic features. Scores are statistical signals about a sampled population — they do not assert anything about any individual account, and they are not accusations. If your profile has been included and you would like it excluded, use the removal form.",
  aboutIntro:
    "TCABR reads public GitHub data and computes an anomaly score for each repo's stargazer sample. Scores are statistical signals — not accusations or verdicts.",
  removalHelp:
    "Submit your GitHub username and we will remove your profile from future reports and blank it in existing ones.",
  removalLegal:
    "Submitting a removal request does not admit anything about your account. We honor all valid requests regardless of reason.",
};

export type CopyKey = keyof typeof COPY;
