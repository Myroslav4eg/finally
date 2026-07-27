import { expect, test } from "@playwright/test";
import { SEED_TICKERS, readStreamFrames, waitForApiPrice } from "../helpers";

const BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

/**
 * The market-data-to-transport seam: the simulator writes into the shared price
 * cache, the SSE generator reads it, and watchlist mutations have to reach both.
 */
test.describe("SSE price stream", () => {
  test("frames carry every tracked ticker and prices actually move", async () => {
    const frames = await readStreamFrames(BASE, 4);
    expect(frames.length).toBe(4);

    for (const ticker of SEED_TICKERS) {
      expect(Object.keys(frames[0]), `${ticker} missing from first frame`).toContain(ticker);
    }

    const first = frames[0];
    const last = frames[frames.length - 1];
    // Correlated GBM: over four ticks at least one symbol must have moved.
    const moved = SEED_TICKERS.filter((ticker) => last[ticker].price !== first[ticker].price);
    expect(moved.length).toBeGreaterThan(0);
  });

  test("each update is internally consistent", async () => {
    const [frame] = await readStreamFrames(BASE, 1);

    for (const [ticker, update] of Object.entries(frame)) {
      expect(update.ticker).toBe(ticker);
      expect(update.price).toBeGreaterThan(0);
      expect(update.timestamp).toBeGreaterThan(1_700_000_000);
      expect(update.change).toBeCloseTo(update.price - update.previous_price, 3);

      const expected =
        update.price > update.previous_price
          ? "up"
          : update.price < update.previous_price
            ? "down"
            : "flat";
      expect(update.direction, `${ticker} direction`).toBe(expected);
    }
  });

  test("adding a ticker starts it streaming, removing it stops", async ({ request }) => {
    const added = await request.post("/api/watchlist", { data: { ticker: "PYPL" } });
    expect(added.status()).toBe(201);

    await waitForApiPrice(request, "PYPL");
    const [withPypl] = await readStreamFrames(BASE, 1);
    expect(Object.keys(withPypl)).toContain("PYPL");

    const removed = await request.delete("/api/watchlist/PYPL");
    expect(removed.status()).toBe(204);

    // remove_ticker drops the symbol from the cache, so the next frame omits it.
    await expect
      .poll(
        async () => {
          const [frame] = await readStreamFrames(BASE, 1);
          return Object.keys(frame).includes("PYPL");
        },
        { timeout: 15_000 },
      )
      .toBe(false);
  });
});
