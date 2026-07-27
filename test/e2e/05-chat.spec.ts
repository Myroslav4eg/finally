import { expect, test, type Page } from "@playwright/test";
import { figure } from "../helpers";
import { startProxy, type SeverableProxy } from "../proxy";

const TARGET = process.env.E2E_BASE_URL ?? "http://localhost:8000";

/**
 * The assistant with LLM_MOCK=true. Prompts follow planning/LLM_MOCK.md.
 *
 * These load the app through a 127.0.0.1 proxy, which is the documented way to
 * run FinAlly (`http://localhost:8000`) and, unlike a hostname origin, is a
 * secure context. The last test in this file loads the same app by hostname and
 * shows why that distinction matters.
 */
test.describe("AI chat", () => {
  let proxy: SeverableProxy;

  test.beforeAll(async () => {
    proxy = await startProxy(TARGET);
  });

  test.afterAll(async () => {
    await proxy.close();
  });

  async function open(page: Page): Promise<void> {
    await page.goto(`${proxy.origin}/`);
    await expect(page.getByTestId("workstation")).toBeVisible();
    await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "live");
    await expect.poll(() => figure(page.getByTestId("header-total-value"))).toBeGreaterThan(0);
  }

  async function send(page: Page, message: string): Promise<void> {
    await page.getByTestId("chat-input").fill(message);
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-loading")).toHaveCount(0, { timeout: 30_000 });
  }

  test("a question gets an answer and no receipts", async ({ page }) => {
    await open(page);

    const assistant = page.getByTestId("chat-message-assistant");
    const openers = await assistant.count();

    await send(page, "How is my portfolio doing?");

    await expect(page.getByTestId("chat-message-user").last()).toContainText(
      "How is my portfolio doing?",
    );
    await expect(assistant).toHaveCount(openers + 1);
    await expect(assistant.last()).toContainText("Mock analysis:");
    await expect(assistant.last().locator("[data-status]")).toHaveCount(0);
  });

  test("a buy shows an inline receipt and moves the portfolio", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("watchlist-price-AAPL")).not.toHaveText("—");

    const cashBefore = await figure(page.getByTestId("header-cash"));

    await send(page, "Buy 3 AAPL");

    const receipt = page.getByTestId("chat-trade-AAPL");
    await expect(receipt).toBeVisible();
    await expect(receipt).toHaveAttribute("data-status", "executed");

    // The panel re-reads the portfolio after an action, so the tape catches up.
    await expect(page.getByTestId("position-row-AAPL")).toBeVisible();
    await expect.poll(() => figure(page.getByTestId("header-cash"))).toBeLessThan(cashBefore);
  });

  test("a rejected trade is reported inline, not as a failed request", async ({ page }) => {
    await open(page);
    const cashBefore = await figure(page.getByTestId("header-cash"));

    await send(page, "Buy 100000 TSLA");

    const receipt = page.getByTestId("chat-trade-TSLA");
    await expect(receipt).toBeVisible();
    await expect(receipt).toHaveAttribute("data-status", "failed");
    await expect(receipt).toContainText("Insufficient cash");

    // Nothing moved, and the assistant is still usable.
    expect(await figure(page.getByTestId("header-cash"))).toBe(cashBefore);
    await expect(page.getByTestId("chat-input")).toBeEnabled();
  });

  test("a watchlist add shows a receipt and reaches the watchlist panel", async ({ page }) => {
    await open(page);

    await send(page, "Add PYPL to my watchlist");

    const receipt = page.getByTestId("chat-watchlist-PYPL");
    await expect(receipt).toBeVisible();
    await expect(receipt).toHaveAttribute("data-status", "executed");

    // The backend really added it.
    const { items } = await (await page.request.get(`${TARGET}/api/watchlist`)).json();
    expect(items.map((item: { ticker: string }) => item.ticker)).toContain("PYPL");

    // And the panel the user is looking at reflects it without a manual reload.
    await expect(page.getByTestId("watchlist-row-PYPL")).toBeVisible();
  });

  test("the panel collapses and reopens", async ({ page }) => {
    await open(page);

    await expect(page.getByTestId("chat-toggle")).toHaveAttribute("aria-expanded", "true");
    await page.getByTestId("chat-toggle").click();
    await expect(page.getByTestId("chat-panel")).toHaveCount(0);
    await expect(page.getByTestId("chat-toggle")).toHaveAttribute("aria-expanded", "false");

    await page.getByTestId("chat-toggle").click();
    await expect(page.getByTestId("chat-panel")).toBeVisible();
  });

  test("an empty message is ignored", async ({ page }) => {
    await open(page);
    const before = await page.getByTestId("chat-message-user").count();

    await page.getByTestId("chat-input").fill("   ");
    await page.getByTestId("chat-send").click();

    await expect(page.getByTestId("chat-message-user")).toHaveCount(before);
    await expect(page.getByTestId("chat-loading")).toHaveCount(0);
  });

  test("sending a message survives a plain-HTTP hostname origin", async ({ page }) => {
    // Same container, reached by hostname rather than 127.0.0.1, so
    // window.isSecureContext is false. The app must still work: the container
    // is meant to be deployed and reached over the network.
    await page.goto("/");
    await expect(page.getByTestId("workstation")).toBeVisible();
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false);

    const crashes: string[] = [];
    page.on("pageerror", (error) => crashes.push(error.message));

    await page.getByTestId("chat-input").fill("How is my portfolio doing?");
    await page.getByTestId("chat-send").click();

    await expect(page.getByTestId("chat-message-user").last()).toContainText("How is my portfolio");
    await expect(page.getByTestId("workstation")).toBeVisible();
    expect(crashes, "the chat submit handler threw").toEqual([]);
  });
});
