import { RepoRefSchema, type RepoRef } from "@tcabr/shared";

export class RepoRefError extends Error {}

export function parseRepoRef(input: string): RepoRef {
  const trimmed = input.trim();
  if (!trimmed) throw new RepoRefError("empty input");

  // SSH form: git@github.com:owner/name.git (name may contain dots, e.g. next.js)
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh) return RepoRefSchema.parse({ owner: ssh[1], name: ssh[2] });

  let pathPart = trimmed;
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/(.+)$/i);
  if (urlMatch) pathPart = urlMatch[1]!;
  else if (/^https?:\/\//i.test(trimmed)) {
    throw new RepoRefError("only github.com URLs are supported");
  }

  pathPart = pathPart.replace(/\.git$/i, "").replace(/\/+$/, "");
  const [owner, name, ...rest] = pathPart.split("/");
  if (!owner || !name) throw new RepoRefError("expected owner/name");
  // Trailing segments like /stargazers are allowed and ignored.
  void rest;
  try {
    return RepoRefSchema.parse({ owner, name });
  } catch {
    throw new RepoRefError("invalid repo reference");
  }
}
