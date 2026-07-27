import { expect, test } from "@playwright/test";
import { SEED_CASH, SEED_TICKERS, figure, openWorkstation, waitForPriceChange } from "../helpers";

/**
 * The only spec that may assert the seeded state. It runs first in the e2e
 * project and mutates nothing, so the specs after it are free to trade.
 */
test.describe("fresh start", () => {
  test("the default ten-ticker watchlist renders", async ({ page }) => {
    await openWorkstation(page);

    const rows = page.getByTestId("watchlist-rows").locator("[data-ticker]");
    await expect(rows).toHaveCount(SEED_TICKERS.length);

    for (const ticker of SEED_TICKERS) {
      await expect(page.getByTestId(`watchlist-row-${ticker}`)).toBeVisible();
    }
    await expect(page.getByTestId("watchlist-count")).toContainText(String(SEED_TICKERS.length));
  });

  test("the header shows 10,000 in cash and no P&L", async ({ page }) => {
    await openWorkstation(page);

    await expect.poll(() => figure(page.getByTestId("header-cash"))).toBe(SEED_CASH);
    expect(await figure(page.getByTestId("header-total-value"))).toBe(SEED_CASH);
    expect(await figure(page.getByTestId("header-pnl"))).toBe(0);
  });

  test("prices stream and keep changing", async ({ page }) => {
    await openWorkstation(page);

    // Every seeded ticker leaves the em-dash placeholder behind.
    for (const ticker of SEED_TICKERS) {
      await expect(page.getByTestId(`watchlist-price-${ticker}`)).not.toHaveText("—");
    }

    // A relationship, never an absolute: the number has to move.
    await waitForPriceChange(page, "TSLA");

    // Session change is measured from the first price seen this session, so it
    // is a signed percentage, not a daily move.
    await expect(page.getByTestId("watchlist-change-TSLA")).toContainText("%");
  });

  test("a price change flashes the cell", async ({ page }) => {
    await openWorkstation(page);

    await expect(page.getByTestId("watchlist-price-NVDA")).not.toHaveText("—");

    // The class lives for ~460ms, so poll faster than the assertion default
    // rather than sampling once.
    await page.waitForFunction(
      () => {
        const cell = document.querySelector('[data-testid="watchlist-price-NVDA"]');
        return cell !== null && /flash-(up|down)/.test(cell.className);
      },
      undefined,
      { timeout: 30_000, polling: 50 },
    );
  });

  test("sparklines accumulate from the stream", async ({ page }) => {
    await openWorkstation(page);

    // Sparkline renders nothing until it has two ticks, so its presence proves
    // client-side accumulation rather than a seeded series.
    await expect(page.getByTestId("watchlist-row-AAPL").locator("svg polyline")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("the main chart and empty panels render", async ({ page }) => {
    await openWorkstation(page);

    await expect(page.getByTestId("main-chart-panel")).toBeVisible();
    await expect(page.getByTestId("main-chart").locator("canvas").first()).toBeVisible();
    await expect(page.getByTestId("main-chart-readout")).toBeVisible();

    await expect(page.getByTestId("heatmap-panel")).toBeVisible();
    await expect(page.getByTestId("pnl-panel")).toBeVisible();
    await expect(page.getByTestId("positions-panel")).toBeVisible();
    await expect(page.getByTestId("positions-count")).toContainText("0");
    await expect(page.getByTestId("trade-bar")).toBeVisible();
    await expect(page.getByTestId("chat-panel")).toBeVisible();
  });

  test("selecting a ticker drives the chart and the order ticket", async ({ page }) => {
    await openWorkstation(page);

    await page.getByTestId("watchlist-row-META").click();
    await expect(page.getByTestId("watchlist-row-META")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("trade-ticker")).toHaveValue("META");
    await expect(page.getByTestId("main-chart-panel")).toContainText("META");
  });
});
