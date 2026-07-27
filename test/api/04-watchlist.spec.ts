import { expect, test } from "@playwright/test";

/** Watchlist route + repository + market source seam. */
test.describe("watchlist mutations", () => {
  test("add normalizes the symbol, is idempotent, and delete is 204", async ({ request }) => {
    const created = await request.post("/api/watchlist", { data: { ticker: " sofi " } });
    expect(created.status()).toBe(201);
    expect((await created.json()).ticker).toBe("SOFI");

    const duplicate = await request.post("/api/watchlist", { data: { ticker: "SOFI" } });
    expect(duplicate.status()).toBe(201);

    const { items } = await (await request.get("/api/watchlist")).json();
    const matches = items.filter((item: { ticker: string }) => item.ticker === "SOFI");
    expect(matches.length).toBe(1);

    const removed = await request.delete("/api/watchlist/sofi");
    expect(removed.status()).toBe(204);

    const after = await (await request.get("/api/watchlist")).json();
    expect(after.items.map((item: { ticker: string }) => item.ticker)).not.toContain("SOFI");
  });

  test("removing a ticker that is not watched is 404", async ({ request }) => {
    const response = await request.delete("/api/watchlist/NOTWATCHED");
    expect(response.status()).toBe(404);
    expect((await response.json()).detail).toContain("NOTWATCHED");
  });

  test("an invalid symbol is rejected with 400", async ({ request }) => {
    const response = await request.post("/api/watchlist", { data: { ticker: "!!" } });
    expect(response.status()).toBe(400);
    expect((await response.json()).detail).toMatch(/Invalid ticker/i);
  });

  test("a newly added ticker becomes tradable once it has a price", async ({ request }) => {
    await request.post("/api/watchlist", { data: { ticker: "SHOP" } });

    await expect
      .poll(
        async () => {
          const { items } = await (await request.get("/api/watchlist")).json();
          return items.find((item: { ticker: string }) => item.ticker === "SHOP")?.price ?? null;
        },
        { timeout: 20_000 },
      )
      .not.toBeNull();

    const trade = await request.post("/api/portfolio/trade", {
      data: { ticker: "SHOP", quantity: 1, side: "buy" },
    });
    expect(trade.status()).toBe(200);
    expect((await trade.json()).trade.ticker).toBe("SHOP");
  });

  test("removing a watched ticker leaves an open position valued at avg cost", async ({
    request,
  }) => {
    await request.post("/api/watchlist", { data: { ticker: "UBER" } });
    await expect
      .poll(
        async () => {
          const { items } = await (await request.get("/api/watchlist")).json();
          return items.find((item: { ticker: string }) => item.ticker === "UBER")?.price ?? null;
        },
        { timeout: 20_000 },
      )
      .not.toBeNull();

    const bought = await (
      await request.post("/api/portfolio/trade", {
        data: { ticker: "UBER", quantity: 2, side: "buy" },
      })
    ).json();

    expect((await request.delete("/api/watchlist/UBER")).status()).toBe(204);

    const { positions } = await (await request.get("/api/portfolio")).json();
    const held = positions.find((p: { ticker: string }) => p.ticker === "UBER");
    expect(held).toBeDefined();
    // Contract: no cached price means current_price is null and the position is
    // carried at cost, so total value does not jump when a symbol is dropped.
    expect(held.current_price).toBeNull();
    expect(held.market_value).toBeCloseTo(2 * bought.trade.price, 2);
    expect(held.unrealized_pnl).toBeCloseTo(0, 2);
  });
});
