import { describe, it, expect, vi, beforeEach } from "vitest";

const rows: { gh_username: string }[] = [];
vi.mock("@/lib/supabase", () => ({
  supabaseService: () => ({
    from: () => ({
      select: () => ({
        in: (_col: string, usernames: string[]) => ({
          then: (cb: (r: { data: { gh_username: string }[] }) => void) =>
            cb({ data: rows.filter((r) => usernames.includes(r.gh_username)) }),
        }),
      }),
    }),
  }),
}));

describe("exclusions", () => {
  beforeEach(() => {
    rows.length = 0;
  });

  it("loadExcluded returns the intersection", async () => {
    rows.push({ gh_username: "bad1" }, { gh_username: "bad2" });
    const { loadExcluded } = await import("@/lib/exclusions");
    const out = await loadExcluded(["bad1", "ok", "bad2"]);
    expect(out).toEqual(new Set(["bad1", "bad2"]));
  });

  it("filterExcluded removes matches", async () => {
    const { filterExcluded } = await import("@/lib/exclusions");
    const excluded = new Set(["x"]);
    expect(
      filterExcluded([{ username: "x" }, { username: "y" }], excluded, (r) => r.username),
    ).toEqual([{ username: "y" }]);
  });
});
