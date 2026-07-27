import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/** The ten tickers the database seeds on first initialization. */
export const SEED_TICKERS = [
  "AAPL",
  "GOOGL",
  "MSFT",
  "AMZN",
  "TSLA",
  "NVDA",
  "META",
  "JPM",
  "V",
  "NFLX",
] as const;

export const SEED_CASH = 10_000;

/**
 * Read a number out of a formatted figure. Handles "$10,000.00", "+$120.40",
 * "-1.24%", and the ▲/▼/– direction glyphs the header and watchlist prepend.
 */
export function parseFigure(text: string | null): number {
  if (text === null) throw new Error("no text to parse");
  // Strip currency punctuation, then take the first signed number. Figures like
  // "▲ +$120.40 +1.24%" carry a glyph and a trailing percent; the leading
  // dollar figure is the one that matters.
  const match = text.replace(/[$,\s]/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) throw new Error(`not a number: ${JSON.stringify(text)}`);
  return Number(match[0]);
}

/** Same, but read straight off a locator. */
export async function figure(locator: Locator): Promise<number> {
  return parseFigure(await locator.textContent());
}

/** Wait for the app shell and a live stream, the precondition for every UI test. */
export async function openWorkstation(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("workstation")).toBeVisible();
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "live");
  // The header paints $0.00 until /api/portfolio resolves. No test in this
  // suite ever spends the account down to nothing, so a positive total is a
  // safe "portfolio loaded" signal.
  await expect.poll(() => figure(page.getByTestId("header-total-value"))).toBeGreaterThan(0);
}

/** Wait until a watchlist row shows a real price rather than the em dash. */
export async function waitForPrice(page: Page, ticker: string): Promise<void> {
  await expect(page.getByTestId(`watchlist-price-${ticker}`)).not.toHaveText("—");
}

/**
 * Wait for a ticker's streamed price to actually move. Proves the stream is
 * live rather than a single stale frame. Never asserts an absolute price.
 */
export async function waitForPriceChange(page: Page, ticker: string): Promise<void> {
  const cell = page.getByTestId(`watchlist-price-${ticker}`);
  await expect(cell).not.toHaveText("—");
  const first = await cell.textContent();
  await expect(cell).not.toHaveText(first ?? "", { timeout: 30_000 });
}

/** Latest cached price for a ticker, straight from the watchlist API. */
export async function apiPrice(request: APIRequestContext, ticker: string): Promise<number> {
  const response = await request.get("/api/watchlist");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const item = body.items.find((entry: { ticker: string }) => entry.ticker === ticker);
  if (!item || item.price == null) throw new Error(`no cached price for ${ticker}`);
  return item.price;
}

/** Poll the watchlist until the simulator has published a price for a ticker. */
export async function waitForApiPrice(
  request: APIRequestContext,
  ticker: string,
  timeoutMs = 20_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await apiPrice(request, ticker);
    } catch (cause) {
      if (Date.now() > deadline) throw cause;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

export interface Portfolio {
  cash_balance: number;
  positions: Array<{
    ticker: string;
    quantity: number;
    avg_cost: number;
    current_price: number | null;
    market_value: number;
    unrealized_pnl: number;
    weight: number;
  }>;
  positions_value: number;
  total_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
}

export async function getPortfolio(request: APIRequestContext): Promise<Portfolio> {
  const response = await request.get("/api/portfolio");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function chat(request: APIRequestContext, message: string) {
  const response = await request.post("/api/chat", { data: { message } });
  return { status: response.status(), body: await response.json() };
}

/**
 * Read one SSE frame from /api/stream/prices without a browser. Returns the
 * parsed price map. `fetch` is used directly because APIRequestContext buffers
 * the whole body and a stream never ends.
 */
export async function readStreamFrames(baseURL: string, count: number): Promise<Array<Record<string, StreamedPrice>>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${baseURL}/api/stream/prices`, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`stream failed: ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const frames: Array<Record<string, StreamedPrice>> = [];
    let buffer = "";

    while (frames.length < count) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const chunk = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        if (chunk.startsWith("data: ")) frames.push(JSON.parse(chunk.slice(6)));
        split = buffer.indexOf("\n\n");
      }
    }
    await reader.cancel();
    return frames;
  } finally {
    clearTimeout(timer);
  }
}

export interface StreamedPrice {
  ticker: string;
  price: number;
  previous_price: number;
  timestamp: number;
  change: number;
  change_percent: number;
  direction: "up" | "down" | "flat";
}
