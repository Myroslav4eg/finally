import { expect, test } from "@playwright/test";
import { chat, getPortfolio, waitForApiPrice } from "../helpers";

/**
 * The widest seam in the app: the chat route runs the real service layer, the
 * real trade validation and the real database, with only the model call
 * replaced. Prompts follow planning/LLM_MOCK.md.
 */
test.describe("chat with LLM_MOCK", () => {
  test("an analysis turn returns a message and no actions", async ({ request }) => {
    const { status, body } = await chat(request, "How is my portfolio doing?");
    expect(status).toBe(200);
    expect(body.message).toMatch(/^Mock analysis:/);
    expect(body.actions.trades).toEqual([]);
    expect(body.actions.watchlist_changes).toEqual([]);
    expect(Date.parse(body.created_at)).not.toBeNaN();
  });

  test("a buy really moves cash through the trade service", async ({ request }) => {
    await waitForApiPrice(request, "AAPL");
    const before = await getPortfolio(request);

    const { status, body } = await chat(request, "Buy 3 AAPL");
    expect(status).toBe(200);
    expect(body.message).toBe("Mock trade: submitting a buy for 3 AAPL at the market price.");

    const [trade] = body.actions.trades;
    expect(trade).toMatchObject({ ticker: "AAPL", side: "buy", quantity: 3, status: "executed" });
    expect(trade.price).toBeGreaterThan(0);
    expect(trade.error).toBeNull();

    const after = await getPortfolio(request);
    expect(after.cash_balance).toBeCloseTo(before.cash_balance - 3 * trade.price, 6);
    expect(after.positions.map((p) => p.ticker)).toContain("AAPL");
  });

  test("a sell reverses it", async ({ request }) => {
    await waitForApiPrice(request, "META");
    await chat(request, "Buy 2 META");

    const before = await getPortfolio(request);
    expect(before.positions.map((p) => p.ticker)).toContain("META");

    const { status, body } = await chat(request, "Sell 1 META");
    expect(status).toBe(200);
    expect(body.message).toBe("Mock trade: submitting a sell for 1 META at the market price.");

    const [trade] = body.actions.trades;
    expect(trade).toMatchObject({ ticker: "META", side: "sell", quantity: 1, status: "executed" });

    const after = await getPortfolio(request);
    expect(after.cash_balance).toBeCloseTo(before.cash_balance + trade.price, 6);
    expect(after.positions.find((p) => p.ticker === "META")!.quantity).toBeCloseTo(1, 6);
  });

  test("a watchlist add and remove reach the database and the price cache", async ({ request }) => {
    const added = await chat(request, "Add PYPL to my watchlist");
    expect(added.status).toBe(200);
    expect(added.body.message).toBe("Mock watchlist: adding PYPL to your watchlist.");
    expect(added.body.actions.watchlist_changes[0]).toMatchObject({
      ticker: "PYPL",
      action: "add",
      status: "executed",
    });

    const watched = await (await request.get("/api/watchlist")).json();
    expect(watched.items.map((item: { ticker: string }) => item.ticker)).toContain("PYPL");

    // Streaming started, so the symbol is priced and tradable.
    await waitForApiPrice(request, "PYPL");

    const removed = await chat(request, "Remove PYPL from my watchlist");
    expect(removed.status).toBe(200);
    expect(removed.body.actions.watchlist_changes[0]).toMatchObject({
      ticker: "PYPL",
      action: "remove",
      status: "executed",
    });

    const after = await (await request.get("/api/watchlist")).json();
    expect(after.items.map((item: { ticker: string }) => item.ticker)).not.toContain("PYPL");
  });

  test("an unaffordable trade is a 200 with status failed and an error", async ({ request }) => {
    const before = await getPortfolio(request);

    const { status, body } = await chat(request, "Buy 100000 AAPL");
    // A failed action is not an HTTP error. 502 is reserved for model failures,
    // which cannot happen in mock mode.
    expect(status).toBe(200);

    const [trade] = body.actions.trades;
    expect(trade.status).toBe("failed");
    expect(trade.price).toBeNull();
    expect(trade.error).toMatch(/^Insufficient cash/);

    const after = await getPortfolio(request);
    expect(after.cash_balance).toBeCloseTo(before.cash_balance, 6);
  });

  test("a fractional quantity survives the round trip", async ({ request }) => {
    const { body } = await chat(request, "Buy 0.25 TSLA");
    expect(body.message).toBe("Mock trade: submitting a buy for 0.25 TSLA at the market price.");
    expect(body.actions.trades[0]).toMatchObject({ quantity: 0.25, status: "executed" });
  });

  test("an empty message is rejected before the model layer", async ({ request }) => {
    const response = await request.post("/api/chat", { data: {} });
    expect(response.status()).toBe(422);
  });
});
