// apps/web/tests/component/LeaderboardTable.test.tsx
import { render, screen } from "@testing-library/react";
import { LeaderboardTable } from "@/components/LeaderboardTable";

describe("LeaderboardTable", () => {
  it("renders repo rows with link and score", () => {
    render(
      <LeaderboardTable
        rows={[
          {
            repo_id: "1", owner: "a", name: "b", star_count: 1000,
            anomaly_score: 72, score_ci_low: 65, score_ci_high: 78,
            sample_size: 2000, stargazer_total: 2000,
            feature_breakdown: {}, star_timeseries: [], created_at: "2026-04-15T00:00:00Z",
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "a/b" })).toHaveAttribute("href", "/r/a/b");
    expect(screen.getByText("72")).toBeVisible();
  });
});
