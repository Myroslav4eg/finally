import { expect, test } from "@playwright/test";
import { openWorkstation } from "../helpers";

/** Watchlist CRUD through the UI. Each test restores what it changed. */
test.describe("watchlist management", () => {
  test("adding a symbol puts a streaming row on the tape", async ({ page }) => {
    await openWorkstation(page);
    const rows = page.getByTestId("watchlist-rows").locator("[data-ticker]");
    const before = await rows.count();

    await page.getByTestId("watchlist-add-input").fill("pypl");
    // The field uppercases as you type, so the request is normalized client-side too.
    await expect(page.getByTestId("watchlist-add-input")).toHaveValue("PYPL");
    await page.getByTestId("watchlist-add-button").click();

    await expect(page.getByTestId("watchlist-row-PYPL")).toBeVisible();
    await expect(rows).toHaveCount(before + 1);
    await expect(page.getByTestId("watchlist-count")).toContainText(String(before + 1));
    await expect(page.getByTestId("watchlist-add-input")).toHaveValue("");
    await expect(page.getByTestId("watchlist-error")).toHaveCount(0);

    // The new symbol joins the simulator, so it starts printing prices.
    await expect(page.getByTestId("watchlist-price-PYPL")).not.toHaveText("—", { timeout: 20_000 });

    // Restore the tape for the specs that follow.
    await page.getByTestId("watchlist-remove-PYPL").click();
    await expect(page.getByTestId("watchlist-row-PYPL")).toHaveCount(0);
  });

  test("removing a symbol drops the row without selecting it", async ({ page }) => {
    await openWorkstation(page);
    await page.getByTestId("watchlist-add-input").fill("SHOP");
    await page.getByTestId("watchlist-add-button").click();
    await expect(page.getByTestId("watchlist-row-SHOP")).toBeVisible();

    await page.getByTestId("watchlist-row-AAPL").click();
    await expect(page.getByTestId("watchlist-row-AAPL")).toHaveAttribute("data-selected", "true");

    await page.getByTestId("watchlist-remove-SHOP").click();

    await expect(page.getByTestId("watchlist-row-SHOP")).toHaveCount(0);
    // The remove button stops propagation, so the selection is untouched.
    await expect(page.getByTestId("watchlist-row-AAPL")).toHaveAttribute("data-selected", "true");
  });

  test("a rejected symbol surfaces the backend detail and adds nothing", async ({ page }) => {
    await openWorkstation(page);
    const rows = page.getByTestId("watchlist-rows").locator("[data-ticker]");
    const before = await rows.count();

    await page.getByTestId("watchlist-add-input").fill("!!");
    await page.getByTestId("watchlist-add-button").click();

    await expect(page.getByTestId("watchlist-error")).toBeVisible();
    await expect(page.getByTestId("watchlist-error")).toContainText("Invalid ticker");
    await expect(rows).toHaveCount(before);
  });

  test("an empty submission is ignored", async ({ page }) => {
    await openWorkstation(page);
    const rows = page.getByTestId("watchlist-rows").locator("[data-ticker]");
    const before = await rows.count();

    await page.getByTestId("watchlist-add-input").fill("   ");
    await page.getByTestId("watchlist-add-button").click();

    await expect(rows).toHaveCount(before);
    await expect(page.getByTestId("watchlist-error")).toHaveCount(0);
  });
});
