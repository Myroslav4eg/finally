import { expect, test } from "@playwright/test";
import { SEED_CASH, SEED_TICKERS, getPortfolio } from "../helpers";

/**
 * The lazy-initialization seam: database seeding, the market data factory, and
 * the price cache all have to agree before any other endpoint means anything.
 * This is the only API spec allowed to assert the seeded state, so it runs
 * first by filename.
 */
test.describe("fresh container state", () => {
  test("health reports the simulator and a populated cache", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    // MASSIVE_API_KEY is empty in the test stack, so the factory must pick the simulator.
    expect(body.market_source).toBe("SimulatorDataSource");
    expect(body.tracked_tickers).toBeGreaterThanOrEqual(SEED_TICKERS.length);
  });

  test("the watchlist is seeded with the ten default tickers", async ({ request }) => {
    const response = await request.get("/api/watchlist");
    expect(response.status()).toBe(200);

    const { items } = await response.json();
    expect(items.map((item: { ticker: string }) => item.ticker).sort()).toEqual(
      [...SEED_TICKERS].sort(),
    );
  });

  test("every seeded ticker gets a price from the simulator", async ({ request }) => {
    await expect
      .poll(
        async () => {
          const { items } = await (await request.get("/api/watchlist")).json();
          return items.filter((item: { price: number | null }) => item.price != null).length;
        },
        { timeout: 20_000 },
      )
      .toBe(SEED_TICKERS.length);

    const { items } = await (await request.get("/api/watchlist")).json();
    for (const item of items) {
      expect(item.price, `${item.ticker} price`).toBeGreaterThan(0);
      expect(item.previous_price).toBeGreaterThan(0);
      expect(["up", "down", "flat"]).toContain(item.direction);
    }
  });

  test("the portfolio starts at 10,000 in cash with no positions", async ({ request }) => {
    const portfolio = await getPortfolio(request);
    expect(portfolio.cash_balance).toBe(SEED_CASH);
    expect(portfolio.positions).toEqual([]);
    expect(portfolio.positions_value).toBe(0);
    expect(portfolio.total_value).toBe(SEED_CASH);
    expect(portfolio.unrealized_pnl).toBe(0);
  });

  test("unmatched /api paths return JSON 404, never the static index", async ({ request }) => {
    const response = await request.get("/api/does-not-exist");
    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("application/json");
  });

  test("the static export is served from the same origin", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    expect(await response.text()).toContain("data-testid=\"workstation\"");
  });
});
