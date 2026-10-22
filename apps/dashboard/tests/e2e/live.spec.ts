import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A stand-in for a developer's app: a real server on another loopback port, so the page is
 * genuinely cross-origin to SlowNet (Chrome blocks public-looking origins from reaching localhost).
 */
async function startExampleApp(slownet: string, session: string): Promise<{ origin: string; server: Server }> {
  const server = createServer((request, response) => {
    if (request.url === "/") {
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><title>idle</title>
        <script src="${slownet}/slownet-live.js" data-session="${session}"></script>
        <button id="go" onclick="fetch('/api/items?token=secret').then(r => document.title = 'ok ' + r.status, e => document.title = 'err ' + (e.code || e.message))">go</button>`);
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ items: [1, 2, 3] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

/** What /slownet-live.js puts on window in the connected app. */
type LiveWindow = Window & { SlowNet?: { client?: { getProfile(): { id: string } } } };

const preset = (page: Page, name: string) => page.getByRole("radio", { name: new RegExp(`^${name}`) });
const rows = (page: Page) => page.getByRole("listbox", { name: "Request timeline" }).getByRole("option");
const statusCell = (page: Page, text: string) => page.getByRole("listbox", { name: "Request timeline" }).locator("[data-cell=status]", { hasText: text });

async function startLiveSession(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Run scenario/ })).toBeEnabled();
  await page.getByRole("radio", { name: "Live session" }).click();
  await expect(page.getByText("Relay connected")).toBeVisible();
  const url = new URL(page.url());
  return { session: url.searchParams.get("live")!, hash: url.hash };
}

test("an app on another origin is shaped by the dashboard and streams into the recorder", async ({ page, context, baseURL }) => {
  const { session, hash } = await startLiveSession(page);
  expect(session).toMatch(/^s_/);
  expect(hash).toMatch(/^#key=k_/);

  const example = await startExampleApp(baseURL!, session);
  test.info().annotations.push({ type: "app", description: example.origin });
  const app = await context.newPage();
  await app.goto(`${example.origin}/`);
  await expect(page.getByText("1 app connected")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("list", { name: "Connected apps" })).toContainText(example.origin);

  // The dashboard switches the connected app to Offline.
  await preset(page, "Offline").click();
  await expect.poll(() => app.evaluate(() => (window as LiveWindow).SlowNet?.client?.getProfile().id)).toBe("offline");
  await app.click("#go");
  await expect(app).toHaveTitle("err OFFLINE");
  await expect(statusCell(page, "Offline")).toBeVisible();

  // Back to Stable: the next request goes through and is recorded too.
  await preset(page, "Stable").click();
  await expect.poll(() => app.evaluate(() => (window as LiveWindow).SlowNet?.client?.getProfile().id)).toBe("stable");
  await app.click("#go");
  await expect(app).toHaveTitle("ok 200");
  await expect(rows(page)).toHaveCount(2);
  await expect(statusCell(page, "OK 200")).toBeVisible();

  // Query strings never leave the app.
  await rows(page).first().click();
  await expect(page.getByRole("complementary", { name: "Request inspector" }).getByText(`GET ${example.origin}/api/items`)).toBeVisible();
  await expect(page.getByText("secret")).toHaveCount(0);
  example.server.close();
});

test("a viewer link can watch but not change the session", async ({ page, context }) => {
  const { session } = await startLiveSession(page);
  const viewer = await context.newPage();
  await viewer.goto(`/?live=${session}`);
  await expect(viewer.getByText(/^View only: you can watch this session/)).toBeVisible();
  await expect(preset(viewer, "Offline")).toBeDisabled();
  await expect(viewer.getByRole("button", { name: "Clear run" })).toBeDisabled();
  await expect(viewer.getByRole("button", { name: "Advanced conditions" })).toHaveCount(0);

  // The owner's change reaches the viewer.
  await preset(page, "Flaky").click();
  await expect(preset(viewer, "Flaky")).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
});

test("the relay validates sessions, control keys and runs", async ({ request }) => {
  const created = await (await request.post("/api/live/sessions")).json();
  const { sessionId, controlKey } = created as { sessionId: string; controlKey: string };
  const profile = { id: "offline", name: "Offline", latencyMs: 0, jitterMs: 0, failureRate: 0, timeoutMs: 8000, offline: true };

  expect((await request.get("/api/live/s_doesnotexist0000000000/state")).status()).toBe(404);
  expect((await request.put(`/api/live/${sessionId}/state`, { data: { profile } })).status()).toBe(403);
  expect((await request.put(`/api/live/${sessionId}/state`, { data: { profile }, headers: { "x-slownet-key": "k_wrong" } })).status()).toBe(403);
  expect((await request.put(`/api/live/${sessionId}/state`, { data: { profile }, headers: { "x-slownet-key": controlKey } })).status()).toBe(200);

  const batch = { protocol: 1, clientId: "client1234", runId: 1, origin: "http://app.test", events: [] };
  expect((await request.post(`/api/live/${sessionId}/events`, { data: batch })).status()).toBe(200);
  expect((await request.post(`/api/live/${sessionId}/events`, { data: { protocol: 1 } })).status()).toBe(400);
  expect((await request.post(`/api/live/${sessionId}/clear`, { headers: { "x-slownet-key": controlKey } })).status()).toBe(200);
  // Events for the run before Clear run are refused, with the current run in the reply.
  const stale = await request.post(`/api/live/${sessionId}/events`, { data: batch });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({ runId: 2 });
});
