import { test, expect } from "@playwright/test";

test("landing renders with search form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/organic/i);
  await expect(page.getByRole("textbox")).toBeVisible();
  await expect(page.getByRole("button", { name: /scan/i })).toBeVisible();
});

test("leaderboard page renders both tables", async ({ page }) => {
  await page.goto("/leaderboard");
  await expect(page.getByText(/most anomalous growth/i)).toBeVisible();
  await expect(page.getByText(/cleanest organic growth/i)).toBeVisible();
});

test("invalid repo input shows inline error", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox").fill("garbage");
  await page.getByRole("button", { name: /scan/i }).click();
  await expect(page.locator("[role='alert']:not([aria-live])")).toBeVisible();
});

test("about page lists feature weights", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByText("new_account")).toBeVisible();
  await expect(page.getByText("star_burst")).toBeVisible();
});
