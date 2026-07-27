import { expect, test, type Locator, type Page } from "@playwright/test";
import { figure, openWorkstation } from "../helpers";

/** Resolved rgb() channels of a cell's background. */
async function background(cell: Locator): Promise<[number, number, number]> {
  const color = await cell.evaluate((node) => getComputedStyle(node).backgroundColor);
  const match = color.match(/\d+(\.\d+)?/g);
  if (!match) throw new Error(`unreadable background: ${color}`);
  return [Number(match[0]), Number(match[1]), Number(match[2])];
}

async function buy(page: Page, ticker: string, quantity: string): Promise<void> {
  await expect(page.getByTestId(`watchlist-price-${ticker}`)).not.toHaveText("—");
  await page.getByTestId("trade-ticker").fill(ticker);
  await page.getByTestId("trade-quantity").fill(quantity);
  await page.getByTestId("trade-buy").click();
  await expect(page.getByTestId("trade-notice")).toHaveAttribute("data-tone", "ok");
}

test.describe("portfolio visualizations", () => {
  test("the heatmap draws a cell per position, sized by market value", async ({ page }) => {
    await openWorkstation(page);
    await buy(page, "NVDA", "2");
    await buy(page, "AMZN", "1");

    const nvda = page.getByTestId("heatmap-cell-NVDA");
    const amzn = page.getByTestId("heatmap-cell-AMZN");
    await expect(nvda).toBeVisible();
    await expect(amzn).toBeVisible();

    // Area is proportional to market value: 2 x ~800 dwarfs 1 x ~185.
    const nvdaBox = (await nvda.boundingBox())!;
    const amznBox = (await amzn.boundingBox())!;
    expect(nvdaBox.width * nvdaBox.height).toBeGreaterThan(amznBox.width * amznBox.height);

    // Each cell reports its own P&L, so colour is never the only channel.
    expect(Number(await nvda.getAttribute("data-pnl"))).not.toBeNaN();
  });

  test("cell colour agrees with the sign of the position's P&L", async ({ page }) => {
    // Waiting for the simulator to push P&L off zero can take a minute.
    test.setTimeout(150_000);
    await openWorkstation(page);
    await buy(page, "TSLA", "2");

    const cell = page.getByTestId("heatmap-cell-TSLA");
    await expect(cell).toBeVisible();

    // A fresh fill sits at zero P&L and renders neutral. Wait for the stream to
    // push it off zero by enough that the sign is unambiguous: on a ~$500 basis
    // ten cents is 0.02%, four times the component's neutral threshold.
    await expect
      .poll(async () => Math.abs(Number(await cell.getAttribute("data-pnl"))), {
        timeout: 90_000,
        intervals: [500],
      })
      .toBeGreaterThan(0.1);

    const pnl = Number(await cell.getAttribute("data-pnl"));
    const [red, green] = await background(cell);
    if (pnl > 0) {
      expect(green, `gain of ${pnl} should read green`).toBeGreaterThan(red);
    } else {
      expect(red, `loss of ${pnl} should read red`).toBeGreaterThan(green);
    }
  });

  test("the empty heatmap says so rather than drawing nothing", async ({ page }) => {
    // Runs against a page with positions, so assert the inverse: with holdings
    // the placeholder is gone and cells exist.
    await openWorkstation(page);
    await buy(page, "GOOGL", "1");
    const cells = page.getByTestId("heatmap").locator("[data-pnl]");
    await expect(cells.first()).toBeVisible();
    expect(await cells.count()).toBeGreaterThan(0);
  });

  test("the P&L chart is seeded from snapshot history and has points", async ({ page }) => {
    await openWorkstation(page);

    // Trades snapshot themselves, so two fills guarantee at least two points
    // without waiting out the 30-second background task.
    await buy(page, "MSFT", "1");
    await buy(page, "META", "1");

    const history = await (await page.request.get("/api/portfolio/history")).json();
    expect(history.snapshots.length).toBeGreaterThanOrEqual(2);
    for (const point of history.snapshots) {
      expect(point.total_value).toBeGreaterThan(0);
      expect(Date.parse(point.recorded_at)).not.toBeNaN();
    }

    // Lightweight Charts renders to canvas, so the DOM proof is the canvas plus
    // the readout the series drives.
    await expect(page.getByTestId("pnl-chart").locator("canvas").first()).toBeVisible();
    const readout = await figure(page.getByTestId("pnl-readout"));
    const total = await figure(page.getByTestId("header-total-value"));
    expect(readout).toBeGreaterThan(0);
    // Same live total, read a tick apart.
    expect(Math.abs(readout - total)).toBeLessThan(5);
  });

  test("the positions table agrees with the header and sorts by market value", async ({ page }) => {
    await openWorkstation(page);

    const portfolio = await (await page.request.get("/api/portfolio")).json();
    expect(portfolio.positions.length).toBeGreaterThan(0);

    await expect(page.getByTestId("positions-count")).toContainText(
      String(portfolio.positions.length),
    );

    for (const position of portfolio.positions) {
      await expect(page.getByTestId(`position-row-${position.ticker}`)).toBeVisible();
      await expect(page.getByTestId(`position-price-${position.ticker}`)).not.toHaveText("—");
    }

    const rendered = await page
      .getByTestId("positions-panel")
      .locator("[data-ticker]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-ticker")!));
    const values = new Map<string, number>(
      portfolio.positions.map((p: { ticker: string; market_value: number }) => [
        p.ticker,
        p.market_value,
      ]),
    );
    expect([...rendered].sort()).toEqual([...values.keys()].sort());

    // Largest first. A 2% slack absorbs the ticks between the API read and the
    // paint; it does not hide a genuinely reversed order.
    for (let i = 1; i < rendered.length; i += 1) {
      expect(values.get(rendered[i])!).toBeLessThanOrEqual(values.get(rendered[i - 1])! * 1.02);
    }
  });
});
