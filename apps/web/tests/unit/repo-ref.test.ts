// apps/web/tests/unit/repo-ref.test.ts
import { describe, it, expect } from "vitest";
import { parseRepoRef, RepoRefError } from "@/lib/repo-ref";

describe("parseRepoRef", () => {
  it("parses owner/name", () => {
    expect(parseRepoRef("vercel/next.js")).toEqual({ owner: "vercel", name: "next.js" });
  });
  it("parses https://github.com/owner/name", () => {
    expect(parseRepoRef("https://github.com/vercel/next.js")).toEqual({
      owner: "vercel", name: "next.js",
    });
  });
  it("strips trailing /stargazers or .git", () => {
    expect(parseRepoRef("https://github.com/vercel/next.js/stargazers")).toEqual({
      owner: "vercel", name: "next.js",
    });
    expect(parseRepoRef("git@github.com:vercel/next.js.git")).toEqual({
      owner: "vercel", name: "next.js",
    });
  });
  it("throws on junk", () => {
    expect(() => parseRepoRef("not a repo")).toThrow(RepoRefError);
    expect(() => parseRepoRef("https://gitlab.com/a/b")).toThrow(RepoRefError);
  });
});
