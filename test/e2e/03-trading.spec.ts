import { expect, test } from "@playwright/test";
import { figure, openWorkstation } from "../helpers";

/**
 * Trade bar to backend and back. Cash is read from the header before and after,
 * so every assertion is a delta; no absolute dollar figure is hard-coded.
 */
test.describe("trading", () => {
  test("buying debits cash, opens a position and leaves total value intact", async ({ page }) => {
    await openWorkstation(page);
    await expect(page.getByTestId("watchlist-price-JPM")).not.toHaveText("—");

    const cashBefore = await figure(page.getByTestId("header-cash"));
    const totalBefore = await figure(page.getByTestId("header-total-value"));
    const quotedBefore = await figure(page.getByTestId("watchlist-price-JPM"));

    await page.getByTestId("trade-ticker").fill("JPM");
    await page.getByTestId("trade-quantity").fill("5");
    await expect(page.getByTestId("trade-estimate")).not.toHaveText("—");
    await page.getByTestId("trade-buy").click();

    await expect(page.getByTestId("trade-notice")).toHaveAttribute("data-tone", "ok");

    // Cash falls by roughly the notional. "Roughly" because the fill takes the
    // tick that was current at the backend, not the one the screen last painted.
    await expect
      .poll(() => figure(page.getByTestId("header-cash")))
      .toBeLessThan(cashBefore);
    const cashAfter = await figure(page.getByTestId("header-cash"));
    const spent = cashBefore - cashAfter;
    expect(spent).toBeGreaterThan(quotedBefore * 5 * 0.98);
    expect(spent).toBeLessThan(quotedBefore * 5 * 1.02);

    // Cash became stock, so the total barely moves.
    const totalAfter = await figure(page.getByTestId("header-total-value"));
    expect(Math.abs(totalAfter - totalBefore)).toBeLessThan(totalBefore * 0.01);

    await expect(page.getByTestId("position-row-JPM")).toBeVisible();
    await expect(page.getByTestId("position-price-JPM")).not.toHaveText("—");
    await expect(page.getByTestId("position-pnl-JPM")).toBeVisible();
    await expect(page.getByTestId("positions-count")).toContainText("1");
  });

  test("selling part of a holding credits cash and keeps the row", async ({ page }) => {
    await openWorkstation(page);
    await expect(page.getByTestId("watchlist-price-V")).not.toHaveText("—");

    await page.getByTestId("trade-ticker").fill("V");
    await page.getByTestId("trade-quantity").fill("4");
    await page.getByTestId("trade-buy").click();
    await expect(page.getByTestId("trade-notice")).toHaveAttribute("data-tone", "ok");
    await expect(page.getByTestId("position-row-V")).toBeVisible();

    const cashBefore = await figure(page.getByTestId("header-cash"));

    await page.getByTestId("trade-quantity").fill("1");
    await page.getByTestId("trade-sell").click();
    await expect(page.getByTestId("trade-notice")).toHaveAttribute("data-tone", "ok");

    await expect.poll(() => figure(page.getByTestId("header-cash"))).toBeGreaterThan(cashBefore);
    await expect(page.getByTestId("position-row-V")).toBeVisible();
  });

  test("selling the whole holding removes the position", async ({ page }) => {
    await openWorkstation(page);
    await expect(page.getByTestId("watchlist-price-NFLX")).not.toHaveText("—");

    await page.getByTestId("trade-ticker").fill("NFLX");
    await page.getByTestId("trade-quantity").fill("2");
    await page.getByTestId("trade-buy").click();
    await expect(page.getByTestId("position-row-NFLX")).toBeVisible();

    const cashBefore = await figure(page.getByTestId("header-cash"));

    await page.getByTestId("trade-sell").click();
    await expect(page.getByTestId("trade-notice")).toHaveAttribute("data-tone", "ok");

    await expect(page.getByTestId("position-row-NFLX")).toHaveCount(0);
    await expect.poll(() => figure(page.getByTestId("header-cash"))).toBeGreaterThan(cashBefore);
  });

  test("an unaffordable order shows the backend detail and changes nothing", async ({ page }) => {
    await openWorkstation(page);
    await expect(page.getByTestId("watchlist-price-NVDA")).not.toHaveText("—");

    const cashBefore = await figure(page.getByTestId("header-cash"));

    await page.getByTestId("trade-ticker").fill("NVDA");
    await page.getByTestId("trade-quantity").fill("100000");
    await page.getByTestId("trade-buy").click();

    const notice = page.getByTestId("trade-notice");
    await expect(notice).toHaveAttribute("data-tone", "error");
    await expect(notice).toContainText("Insufficient cash");

    await expect(page.getByTestId("position-row-NVDA")).toHaveCount(0);
    expect(await figure(page.getByTestId("header-cash"))).toBe(cashBefore);
  });

  test("the buy and sell buttons are disabled without a positive quantity", async ({ page }) => {
    await openWorkstation(page);

    await page.getByTestId("trade-quantity").fill("0");
    await expect(page.getByTestId("trade-buy")).toBeDisabled();
    await expect(page.getByTestId("trade-sell")).toBeDisabled();

    await page.getByTestId("trade-quantity").fill("-3");
    await expect(page.getByTestId("trade-buy")).toBeDisabled();

    await page.getByTestId("trade-quantity").fill("abc");
    await expect(page.getByTestId("trade-buy")).toBeDisabled();
    await expect(page.getByTestId("trade-estimate")).toHaveText("—");

    await page.getByTestId("trade-quantity").fill("1");
    await expect(page.getByTestId("trade-buy")).toBeEnabled();
  });

  test("the ticket falls back to the selection instead of going blank", async ({ page }) => {
    await openWorkstation(page);
    await page.getByTestId("watchlist-row-AAPL").click();

    // Clearing the field re-fills it from the current selection, so the empty
    // half of the disabled rule is unreachable while a ticker is selected.
    await page.getByTestId("trade-ticker").fill("");
    await expect(page.getByTestId("trade-ticker")).toHaveValue("AAPL");
    await expect(page.getByTestId("trade-buy")).toBeEnabled();
  });

  test("clicking a position row selects it in the chart and the ticket", async ({ page }) => {
    await openWorkstation(page);
    await expect(page.getByTestId("watchlist-price-MSFT")).not.toHaveText("—");

    await page.getByTestId("trade-ticker").fill("MSFT");
    await page.getByTestId("trade-quantity").fill("1");
    await page.getByTestId("trade-buy").click();
    await expect(page.getByTestId("position-row-MSFT")).toBeVisible();

    await page.getByTestId("watchlist-row-TSLA").click();
    await expect(page.getByTestId("trade-ticker")).toHaveValue("TSLA");

    await page.getByTestId("position-row-MSFT").click();
    await expect(page.getByTestId("trade-ticker")).toHaveValue("MSFT");
    await expect(page.getByTestId("main-chart-panel")).toContainText("MSFT");
  });
});
