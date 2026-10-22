import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const runButton = (page: Page, endpoint: string) => page.getByRole("button", { name: `Run ${endpoint}`, exact: true });
const preset = (page: Page, name: string) => page.getByRole("radio", { name: new RegExp(`^${name}`) });
const timeline = (page: Page) => page.getByRole("listbox", { name: "Request timeline" });
const rows = (page: Page) => timeline(page).getByRole("option");
const statusCell = (page: Page, text: string) => timeline(page).locator("[data-cell=status]", { hasText: text });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Request inspector" });

async function openAdvanced(page: Page) {
  const toggle = page.getByRole("button", { name: "Advanced conditions" });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

async function runSample(page: Page) {
  await page.getByRole("button", { name: "Load sample session" }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Load sample session" })).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No requests yet.")).toBeVisible();
  // Wait for hydration so global shortcuts are attached.
  await expect(page.getByRole("button", { name: /^Run scenario/ })).toBeEnabled();
});

test("Stable profile loads demo data and records a successful request", async ({ page }) => {
  await runButton(page, "Fetch catalog").click();

  await expect(page.getByText(/4 items: Field Notebook/)).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(statusCell(page, "OK 200")).toBeVisible();
});

test("Offline profile shows a distinct offline error with a retry option", async ({ page }) => {
  await preset(page, "Offline").click();
  await runButton(page, "Fetch catalog").click();

  await expect(page.getByText("You're offline")).toBeVisible();
  await expect(page.getByText("Source: SlowNet simulation")).toBeVisible();
  await expect(statusCell(page, "Offline")).toBeVisible();

  // Recover: go back online and retry the same request as its next attempt.
  await preset(page, "Stable").click();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(/4 items: Field Notebook/)).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(timeline(page).getByText("↻ 1")).toBeVisible();
});

test("Flaky profile with seed 1 fails once, then the bounded retry succeeds", async ({ page }) => {
  await preset(page, "Flaky").click();
  await openAdvanced(page);
  await page.getByLabel("Seed", { exact: true }).fill("1");
  await page.getByRole("switch", { name: /Auto-retry/ }).check();

  await runButton(page, "Fetch catalog").click();

  await expect(page.getByRole("article", { name: "Fetch catalog" }).getByText("· 2 attempts")).toBeVisible();
  await expect(timeline(page).getByText("↻ 1")).toBeVisible();

  await rows(page).first().click();
  await expect(inspector(page).getByText("Used (Flaky Network)")).toBeVisible();
  await expect(inspector(page).getByText(/2\. Set seed 1\./)).toBeVisible();
  await inspector(page).getByRole("tab", { name: "Attempts" }).click();
  await expect(inspector(page).getByText("· SIMULATED_FAILURE")).toBeVisible();
  await expect(inspector(page).getByText(/Auto-retry: up to 2 retries/)).toBeVisible();
});

test("A request keeps the profile it ran with after the active profile changes", async ({ page }) => {
  await runButton(page, "Load account").click();
  await expect(page.getByText("Demo User · Pro plan")).toBeVisible();
  await page.keyboard.press("5"); // Offline

  await rows(page).first().click();
  await expect(inspector(page).getByText("Used (Stable)")).toBeVisible();
  await expect(inspector(page).getByText("Active now (Offline)")).toBeVisible();
  await expect(inspector(page).getByText(/This request keeps the values it ran with/)).toBeVisible();
});

test("Export is named after the date and scenario, and its timing split reconciles", async ({ page }) => {
  await runSample(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export report" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^slownet-offline-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);

  const report = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(report).toMatchObject({ tool: "slownet", schemaVersion: 1, profile: { id: "offline" }, summary: { totalRequests: 3, totalAttempts: 4 } });
  expect(report.events[1]).toMatchObject({ profileSnapshot: { id: "flaky", seed: 1 }, retryPolicy: { maxRetries: 2 } });
  expect(report.requests).toHaveLength(3);
  for (const request of report.requests) expect(request.simulatedMs + request.executionMs + request.waitMs).toBe(request.wallMs);
  expect(report.timingDefinitions.wallMs).toBeTruthy();
  await expect(page.getByText(/Download started · 4 records/)).toBeVisible();
});

test("Clear run empties the recorder and can be undone", async ({ page }) => {
  await runButton(page, "Load account").click();
  await expect(page.getByText("Demo User · Pro plan")).toBeVisible();

  await page.getByRole("button", { name: "Clear run" }).click();
  await expect(page.getByText("No requests yet.")).toBeVisible();
  await expect(page.getByText("Not run yet.")).toHaveCount(3);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByText("Demo User · Pro plan")).toBeVisible();
});

test("Advanced conditions reject invalid values and keep the last valid profile", async ({ page }) => {
  await openAdvanced(page);
  await page.getByLabel("Failure rate", { exact: true }).fill("150");
  await expect(page.getByText("Must be between 0 and 100%")).toBeVisible();
  await page.getByLabel("Latency", { exact: true }).fill("");
  await expect(page.getByText("Required")).toBeVisible();
  await expect(preset(page, "Stable")).toHaveAttribute("aria-checked", "true");
});

test("Filters, zoom and the sample session use the recorded run", async ({ page }) => {
  await runSample(page);
  await expect(statusCell(page, "OK 200")).toHaveCount(2);
  await expect(statusCell(page, "Offline")).toBeVisible();

  await page.getByRole("radio", { name: /^Failed/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("radio", { name: /^Retried/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("radio", { name: /^Timed out/ }).click();
  await expect(page.getByText("No requests match “Timed out”.")).toBeVisible();
  await page.getByRole("radio", { name: /^All/ }).click();

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText(/^Zoomed ·/)).toBeVisible();
  await page.getByRole("button", { name: "Zoom to fit" }).click();
  await expect(page.getByText(/^Fit ·/)).toBeVisible();

  await rows(page).nth(1).hover();
  await expect(page.getByRole("tooltip")).toContainText(/wall \d+ ms = sim \d+ ms \+ exec \d+ ms \+ wait \d+ ms/);
});

test("Keyboard: presets, run, inspect, focus mode, command menu and help", async ({ page }) => {
  await page.keyboard.press("5");
  await expect(preset(page, "Offline")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("r");
  await expect(page.getByText("You're offline")).toBeVisible();

  await timeline(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows(page).first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(inspector(page).getByText("Blocked · offline, never sent")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Request details" })).toBeHidden();

  await page.keyboard.press("f");
  await expect(page.getByRole("heading", { name: /Demo endpoints/ })).toBeHidden();
  await page.keyboard.press("f");
  await expect(page.getByRole("heading", { name: /Demo endpoints/ })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Search commands" }).fill("slow 3g");
  await page.keyboard.press("Enter");
  await expect(preset(page, "Slow 3G")).toHaveAttribute("aria-checked", "true");

  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeHidden();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Single-key shortcuts are ignored while typing in a field", async ({ page }) => {
  await openAdvanced(page);
  const seed = page.getByLabel("Seed", { exact: true });
  await seed.click();
  await page.keyboard.type("3");
  await expect(seed).toHaveValue("3");
  await expect(preset(page, "Stable")).toHaveAttribute("aria-checked", "true");
});
