import { expect, test } from "@playwright/test";
import { getPortfolio, waitForApiPrice } from "../helpers";

/**
 * The trading seam: the route, the service validation, the price cache, and the
 * transactional write across cash, positions, the trade log and the snapshot
 * table. Every assertion is a delta from a baseline read at the top of the test,
 * so nothing here depends on what ran before.
 */
test.describe("trade execution", () => {
  test("a buy debits cash by the fill notional and opens a position", async ({ request }) => {
    await waitForApiPrice(request, "MSFT");
    const before = await getPortfolio(request);
    const heldBefore = before.positions.find((p) => p.ticker === "MSFT")?.quantity ?? 0;

    const response = await request.post("/api/portfolio/trade", {
      data: { ticker: "MSFT", quantity: 4, side: "buy" },
    });
    expect(response.status()).toBe(200);

    const execution = await response.json();
    expect(execution.trade.ticker).toBe("MSFT");
    expect(execution.trade.side).toBe("buy");
    expect(execution.trade.quantity).toBe(4);
    expect(execution.trade.price).toBeGreaterThan(0);
    expect(execution.trade.notional).toBeCloseTo(execution.trade.quantity * execution.trade.price, 1);
    expect(execution.position.quantity).toBeCloseTo(heldBefore + 4, 6);

    // Cash moved by exactly the fill, not by some later streamed price.
    expect(execution.cash_balance).toBeCloseTo(
      before.cash_balance - execution.trade.quantity * execution.trade.price,
      6,
    );

    const after = await getPortfolio(request);
    expect(after.cash_balance).toBeCloseTo(execution.cash_balance, 6);
    expect(after.positions.map((p) => p.ticker)).toContain("MSFT");
  });

  test("a buy writes a portfolio snapshot", async ({ request }) => {
    const before = await (await request.get("/api/portfolio/history")).json();

    await waitForApiPrice(request, "JPM");
    const response = await request.post("/api/portfolio/trade", {
      data: { ticker: "JPM", quantity: 1, side: "buy" },
    });
    expect(response.status()).toBe(200);

    const after = await (await request.get("/api/portfolio/history")).json();
    expect(after.snapshots.length).toBeGreaterThan(before.snapshots.length);

    const latest = after.snapshots[after.snapshots.length - 1];
    expect(latest.total_value).toBeGreaterThan(0);
    expect(Date.parse(latest.recorded_at)).not.toBeNaN();

    // Oldest first, as the chart expects.
    const times = after.snapshots.map((s: { recorded_at: string }) => Date.parse(s.recorded_at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  test("averaging up keeps a weighted-average cost", async ({ request }) => {
    await waitForApiPrice(request, "NVDA");

    const one = await (
      await request.post("/api/portfolio/trade", {
        data: { ticker: "NVDA", quantity: 2, side: "buy" },
      })
    ).json();
    const two = await (
      await request.post("/api/portfolio/trade", {
        data: { ticker: "NVDA", quantity: 3, side: "buy" },
      })
    ).json();

    const expectedAvg =
      (one.trade.quantity * one.trade.price + two.trade.quantity * two.trade.price) /
      (one.trade.quantity + two.trade.quantity);
    expect(two.position.quantity).toBeCloseTo(5, 6);
    expect(two.position.avg_cost).toBeCloseTo(expectedAvg, 4);
  });

  test("a partial sell credits cash and leaves avg cost alone", async ({ request }) => {
    await waitForApiPrice(request, "AMZN");
    await request.post("/api/portfolio/trade", {
      data: { ticker: "AMZN", quantity: 6, side: "buy" },
    });

    const before = await getPortfolio(request);
    const held = before.positions.find((p) => p.ticker === "AMZN");
    expect(held).toBeDefined();

    const sold = await (
      await request.post("/api/portfolio/trade", {
        data: { ticker: "AMZN", quantity: 2, side: "sell" },
      })
    ).json();

    expect(sold.cash_balance).toBeCloseTo(
      before.cash_balance + sold.trade.quantity * sold.trade.price,
      6,
    );
    expect(sold.position.quantity).toBeCloseTo(held!.quantity - 2, 6);
    expect(sold.position.avg_cost).toBeCloseTo(held!.avg_cost, 6);
  });

  test("selling the whole holding removes the position row", async ({ request }) => {
    await waitForApiPrice(request, "NFLX");
    await request.post("/api/portfolio/trade", {
      data: { ticker: "NFLX", quantity: 3, side: "buy" },
    });

    const before = await getPortfolio(request);
    const held = before.positions.find((p) => p.ticker === "NFLX")!;

    const sold = await (
      await request.post("/api/portfolio/trade", {
        data: { ticker: "NFLX", quantity: held.quantity, side: "sell" },
      })
    ).json();

    expect(sold.position).toBeNull();
    const after = await getPortfolio(request);
    expect(after.positions.map((p) => p.ticker)).not.toContain("NFLX");
  });

  test("fractional quantities fill", async ({ request }) => {
    await waitForApiPrice(request, "GOOGL");
    const response = await request.post("/api/portfolio/trade", {
      data: { ticker: "googl", quantity: 0.25, side: "buy" },
    });
    expect(response.status()).toBe(200);

    const execution = await response.json();
    expect(execution.trade.ticker).toBe("GOOGL");
    expect(execution.trade.quantity).toBeCloseTo(0.25, 6);
  });

  test.describe("rejections write nothing", () => {
    const cases = [
      { name: "insufficient cash", data: { ticker: "AAPL", quantity: 1e6, side: "buy" }, detail: /Insufficient cash/i },
      { name: "insufficient shares", data: { ticker: "V", quantity: 1e6, side: "sell" }, detail: /Insufficient shares/i },
      { name: "zero quantity", data: { ticker: "AAPL", quantity: 0, side: "buy" }, detail: /greater than zero/i },
      { name: "negative quantity", data: { ticker: "AAPL", quantity: -5, side: "buy" }, detail: /greater than zero/i },
      { name: "unpriced ticker", data: { ticker: "ZZZZ", quantity: 1, side: "buy" }, detail: /No price available/i },
      { name: "invalid symbol", data: { ticker: "1234!", quantity: 1, side: "buy" }, detail: /Invalid ticker/i },
    ];

    for (const testCase of cases) {
      test(testCase.name, async ({ request }) => {
        const before = await getPortfolio(request);

        const response = await request.post("/api/portfolio/trade", { data: testCase.data });
        expect(response.status()).toBe(400);
        expect((await response.json()).detail).toMatch(testCase.detail);

        const after = await getPortfolio(request);
        expect(after.cash_balance).toBeCloseTo(before.cash_balance, 6);
        expect(after.positions.length).toBe(before.positions.length);
      });
    }

    test("an unknown side is rejected by request validation", async ({ request }) => {
      const response = await request.post("/api/portfolio/trade", {
        data: { ticker: "AAPL", quantity: 1, side: "hold" },
      });
      expect(response.status()).toBe(422);
    });
  });
});
