import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Workstation } from "@/components/Workstation";
import {
  fetchHistory,
  fetchPortfolio,
  fetchWatchlist,
  sendChatMessage,
} from "@/lib/api";
import { makePortfolio, makePosition } from "@/test/harness";
import type { WatchlistItem } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  USE_MOCK: false,
  fetchPortfolio: vi.fn(),
  fetchHistory: vi.fn(),
  fetchWatchlist: vi.fn(),
  addWatchlistTicker: vi.fn(),
  removeWatchlistTicker: vi.fn(),
  executeTrade: vi.fn(),
  sendChatMessage: vi.fn(),
}));

// Lightweight Charts needs a real canvas; the panels around it are what matter.
vi.mock("lightweight-charts", () => ({
  AreaSeries: "Area",
  LineSeries: "Line",
  createChart: () => ({
    addSeries: () => ({ setData: vi.fn(), update: vi.fn(), applyOptions: vi.fn() }),
    subscribeCrosshairMove: vi.fn(),
    timeScale: () => ({ fitContent: vi.fn() }),
    remove: vi.fn(),
    applyOptions: vi.fn(),
  }),
}));

const portfolio = vi.mocked(fetchPortfolio);
const history = vi.mocked(fetchHistory);
const watchlist = vi.mocked(fetchWatchlist);
const chat = vi.mocked(sendChatMessage);

const items = (...tickers: string[]): WatchlistItem[] =>
  tickers.map((ticker) => ({
    ticker,
    added_at: "2026-01-01T00:00:00Z",
    price: null,
    previous_price: null,
    change: null,
    change_percent: null,
    direction: null,
  }));

describe("Workstation", () => {
  beforeEach(() => {
    portfolio.mockResolvedValue(makePortfolio());
    history.mockResolvedValue([]);
    watchlist.mockResolvedValue(items("AAPL", "MSFT"));
  });

  const ask = async (text: string) => {
    await userEvent.type(screen.getByTestId("chat-input"), text);
    await userEvent.click(screen.getByTestId("chat-send"));
  };

  it("renders every panel", async () => {
    render(<Workstation />);
    await screen.findByTestId("watchlist-row-AAPL");

    for (const id of [
      "workstation",
      "watchlist-panel",
      "main-chart-panel",
      "heatmap-panel",
      "pnl-panel",
      "positions-panel",
      "trade-bar",
      "chat-panel",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  /**
   * Regression for DEFECT-2. A watchlist change made by the assistant has to
   * reach the watchlist panel; previously only the portfolio was re-read.
   */
  it("shows a ticker the assistant added to the watchlist", async () => {
    render(<Workstation />);
    await screen.findByTestId("watchlist-row-AAPL");
    expect(screen.queryByTestId("watchlist-row-PYPL")).not.toBeInTheDocument();

    watchlist.mockResolvedValue(items("AAPL", "MSFT", "PYPL"));
    chat.mockResolvedValue({
      message: "Added PYPL.",
      actions: {
        trades: [],
        watchlist_changes: [{ ticker: "PYPL", action: "add", status: "executed" }],
      },
      created_at: "2026-01-01T00:00:00Z",
    });

    await ask("Add PYPL to my watchlist");

    expect(await screen.findByTestId("chat-watchlist-PYPL")).toBeInTheDocument();
    expect(await screen.findByTestId("watchlist-row-PYPL")).toBeInTheDocument();
    expect(screen.getByTestId("watchlist-count")).toHaveTextContent("3 symbols");
  });

  it("drops a ticker the assistant removed from the watchlist", async () => {
    render(<Workstation />);
    await screen.findByTestId("watchlist-row-MSFT");

    watchlist.mockResolvedValue(items("AAPL"));
    chat.mockResolvedValue({
      message: "Removed MSFT.",
      actions: {
        trades: [],
        watchlist_changes: [{ ticker: "MSFT", action: "remove", status: "executed" }],
      },
      created_at: "2026-01-01T00:00:00Z",
    });

    await ask("Drop MSFT");

    await waitFor(() =>
      expect(screen.queryByTestId("watchlist-row-MSFT")).not.toBeInTheDocument(),
    );
  });

  it("re-reads the portfolio after the assistant trades", async () => {
    render(<Workstation />);
    await screen.findByTestId("watchlist-row-AAPL");

    portfolio.mockResolvedValue(
      makePortfolio({
        cash_balance: 3100,
        positions: [makePosition("AAPL", 10, 180, 190), makePosition("MSFT", 2, 420)],
      }),
    );
    chat.mockResolvedValue({
      message: "Bought 2 MSFT.",
      actions: {
        trades: [{ ticker: "MSFT", side: "buy", quantity: 2, status: "executed", price: 420 }],
        watchlist_changes: [],
      },
      created_at: "2026-01-01T00:00:00Z",
    });

    await ask("Buy 2 MSFT");

    expect(await screen.findByTestId("position-row-MSFT")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("header-cash")).toHaveTextContent("$3,100.00"),
    );
  });

  it("re-reads both the portfolio and the watchlist in one turn", async () => {
    render(<Workstation />);
    await screen.findByTestId("watchlist-row-AAPL");

    const portfolioReads = portfolio.mock.calls.length;
    const watchlistReads = watchlist.mock.calls.length;

    chat.mockResolvedValue({
      message: "Bought PYPL and started watching it.",
      actions: {
        trades: [{ ticker: "PYPL", side: "buy", quantity: 1, status: "executed", price: 60 }],
        watchlist_changes: [{ ticker: "PYPL", action: "add", status: "executed" }],
      },
      created_at: "2026-01-01T00:00:00Z",
    });

    await ask("Buy 1 PYPL and watch it");

    await waitFor(() => {
      expect(portfolio.mock.calls.length).toBeGreaterThan(portfolioReads);
      expect(watchlist.mock.calls.length).toBeGreaterThan(watchlistReads);
    });
  });

  it("does not re-read anything after a conversation-only turn", async () => {
    render(<Workstation />);
    await screen.findByTestId("watchlist-row-AAPL");

    const portfolioReads = portfolio.mock.calls.length;
    const watchlistReads = watchlist.mock.calls.length;

    chat.mockResolvedValue({
      message: "You are up 2%.",
      actions: { trades: [], watchlist_changes: [] },
      created_at: "2026-01-01T00:00:00Z",
    });

    await ask("How am I doing");

    await waitFor(() =>
      expect(screen.getAllByTestId("chat-message-assistant").at(-1)).toHaveTextContent(
        "You are up 2%.",
      ),
    );
    expect(portfolio.mock.calls.length).toBe(portfolioReads);
    expect(watchlist.mock.calls.length).toBe(watchlistReads);
  });

  it("collapses and restores the assistant panel", async () => {
    render(<Workstation />);
    await screen.findByTestId("watchlist-row-AAPL");

    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });
});
