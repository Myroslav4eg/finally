import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TradeBar } from "@/components/TradeBar";
import { executeTrade } from "@/lib/api";
import { makeStream, makeUpdate, withStream } from "@/test/harness";
import type { TradeExecution } from "@/lib/types";

vi.mock("@/lib/api", () => ({ executeTrade: vi.fn() }));

const mocked = vi.mocked(executeTrade);
const stream = makeStream({ prices: { AAPL: makeUpdate("AAPL", 190) } });

const execution = (side: "buy" | "sell", cash: number): TradeExecution => ({
  trade: {
    id: "1",
    ticker: "AAPL",
    side,
    quantity: 10,
    price: 190,
    notional: 1900,
    executed_at: "2026-01-01T00:00:00Z",
  },
  position: null,
  cash_balance: cash,
  total_value: cash + 1900,
});

function renderBar(symbol = "AAPL", onTraded = vi.fn().mockResolvedValue(undefined)) {
  const onSymbolChange = vi.fn();
  render(<TradeBar symbol={symbol} onSymbolChange={onSymbolChange} onTraded={onTraded} />, {
    wrapper: withStream(stream),
  });
  return { onSymbolChange, onTraded };
}

describe("TradeBar", () => {
  it("estimates the order value from the live price", () => {
    renderBar();
    expect(screen.getByTestId("trade-estimate")).toHaveTextContent("$1,900.00");
  });

  it("buys at the market with no confirmation step", async () => {
    mocked.mockResolvedValue(execution("buy", 8100));
    const { onTraded } = renderBar();

    await userEvent.click(screen.getByTestId("trade-buy"));

    expect(mocked).toHaveBeenCalledWith({ ticker: "AAPL", quantity: 10, side: "buy" });
    await waitFor(() => expect(onTraded).toHaveBeenCalled());
    expect(screen.getByTestId("trade-notice")).toHaveTextContent("Bought 10 AAPL at 190.00");
  });

  it("sells with the same ticket", async () => {
    mocked.mockResolvedValue(execution("sell", 11900));
    renderBar();

    await userEvent.click(screen.getByTestId("trade-sell"));
    expect(mocked).toHaveBeenCalledWith({ ticker: "AAPL", quantity: 10, side: "sell" });
  });

  it("shows the backend's reason when a trade is rejected", async () => {
    mocked.mockRejectedValue(new Error("Not enough cash"));
    renderBar();

    await userEvent.click(screen.getByTestId("trade-buy"));

    const notice = await screen.findByTestId("trade-notice");
    expect(notice).toHaveTextContent("Not enough cash");
    expect(notice).toHaveAttribute("data-tone", "error");
  });

  it("disables trading without a ticker", () => {
    renderBar("");
    expect(screen.getByTestId("trade-buy")).toBeDisabled();
    expect(screen.getByTestId("trade-sell")).toBeDisabled();
  });

  it("disables trading when the quantity is not positive", async () => {
    renderBar();
    await userEvent.clear(screen.getByTestId("trade-quantity"));
    await userEvent.type(screen.getByTestId("trade-quantity"), "0");
    expect(screen.getByTestId("trade-buy")).toBeDisabled();
  });

  it("hands ticker edits back to the parent", async () => {
    const { onSymbolChange } = renderBar();
    await userEvent.type(screen.getByTestId("trade-ticker"), "x");
    expect(onSymbolChange).toHaveBeenCalledWith("AAPLX");
  });
});
