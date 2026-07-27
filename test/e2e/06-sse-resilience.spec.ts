import { expect, test, type Page } from "@playwright/test";
import { figure, openWorkstation, waitForPriceChange } from "../helpers";
import { startProxy, type SeverableProxy } from "../proxy";

const TARGET = process.env.E2E_BASE_URL ?? "http://localhost:8000";

/**
 * EventSource owns the retry, so the app only has to report state honestly and
 * pick the stream back up.
 *
 * The outage is produced by destroying the socket under a pass-through proxy.
 * `BrowserContext.setOffline` was tried first and does not work: Chromium's
 * offline emulation refuses new requests but leaves an established streaming
 * response flowing, so the status stayed "live" for the whole window.
 */
test.describe("SSE resilience", () => {
  let proxy: SeverableProxy;

  test.beforeAll(async () => {
    proxy = await startProxy(TARGET);
  });

  test.afterAll(async () => {
    await proxy.close();
  });

  async function openThroughProxy(page: Page): Promise<void> {
    await page.goto(`${proxy.origin}/`);
    await expect(page.getByTestId("workstation")).toBeVisible();
    await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "live");
    await expect.poll(() => figure(page.getByTestId("header-total-value"))).toBeGreaterThan(0);
  }

  test("a severed stream is reported, then reconnects on its own", async ({ page }) => {
    test.setTimeout(150_000);
    await openThroughProxy(page);
    await waitForPriceChange(page, "AAPL");

    const status = page.getByTestId("connection-status");
    await expect(status).toHaveAttribute("data-status", "live");

    // Kill the live connection and refuse the retries.
    proxy.block(true);
    proxy.sever();

    // EventSource retries on its own, so "connecting" is the honest state;
    // "offline" only if the browser gave up on the source entirely.
    await expect(status).toHaveAttribute("data-status", /connecting|offline/, { timeout: 30_000 });
    await expect(page.getByTestId("connection-dot")).toBeVisible();

    // Let the retries through again. The server sends `retry: 1000`.
    proxy.block(false);

    await expect(status).toHaveAttribute("data-status", "live", { timeout: 45_000 });

    // Reconnected means resumed, not merely re-labelled.
    await waitForPriceChange(page, "AAPL");
  });

  test("the watchlist survives the outage with its prices intact", async ({ page }) => {
    test.setTimeout(150_000);
    await openThroughProxy(page);
    await waitForPriceChange(page, "MSFT");

    const before = await figure(page.getByTestId("watchlist-price-MSFT"));

    proxy.sever();
    await expect(page.getByTestId("connection-status")).toHaveAttribute(
      "data-status",
      /connecting|offline/,
      { timeout: 30_000 },
    );

    // The last known price stays on screen rather than reverting to the em dash.
    expect(await figure(page.getByTestId("watchlist-price-MSFT"))).toBeCloseTo(before, 2);

    await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "live", {
      timeout: 45_000,
    });
    await waitForPriceChange(page, "MSFT");
  });

  test("prices keep flowing after a full page reload", async ({ page }) => {
    await openWorkstation(page);
    await waitForPriceChange(page, "MSFT");

    await page.reload();
    await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "live");
    await waitForPriceChange(page, "MSFT");
  });

  test("abandoned streams do not degrade the server", async ({ page, baseURL }) => {
    await openWorkstation(page);

    for (let i = 0; i < 5; i += 1) {
      const controller = new AbortController();
      void fetch(`${baseURL}/api/stream/prices`, { signal: controller.signal }).catch(() => {});
      controller.abort();
    }

    await page.reload();
    await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "live");
    await waitForPriceChange(page, "AAPL");
  });
});
