import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Watchlist } from "@/components/Watchlist";
import { PriceStreamContext } from "@/hooks/usePrices";
import type { WatchlistHook } from "@/hooks/useWatchlist";
import { makeStream, makeUpdate, withStream } from "@/test/harness";

function makeWatchlist(overrides: Partial<WatchlistHook> = {}): WatchlistHook {
  return {
    tickers: ["AAPL", "MSFT"],
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    error: null,
    ...overrides,
  };
}

const stream = (price: number, open = 190) =>
  makeStream({
    prices: { AAPL: makeUpdate("AAPL", price, open) },
    sessionOpen: { AAPL: open },
    history: { AAPL: [{ time: 1, value: open }, { time: 2, value: price }] },
  });

describe("Watchlist", () => {
  it("renders a row per ticker with the live price", () => {
    render(<Watchlist watchlist={makeWatchlist()} selected={null} onSelect={vi.fn()} />, {
      wrapper: withStream(stream(191.25)),
    });

    expect(screen.getByTestId("watchlist-row-AAPL")).toBeInTheDocument();
    expect(screen.getByTestId("watchlist-row-MSFT")).toBeInTheDocument();
    expect(screen.getByTestId("watchlist-price-AAPL")).toHaveTextContent("191.25");
    expect(screen.getByTestId("watchlist-count")).toHaveTextContent("2 symbols");
  });

  it("shows a dash for a ticker that has not ticked yet", () => {
    render(<Watchlist watchlist={makeWatchlist()} selected={null} onSelect={vi.fn()} />, {
      wrapper: withStream(makeStream()),
    });
    expect(screen.getByTestId("watchlist-price-MSFT")).toHaveTextContent("—");
  });

  it("shows session change against the session open, with a direction glyph", () => {
    render(<Watchlist watchlist={makeWatchlist()} selected={null} onSelect={vi.fn()} />, {
      wrapper: withStream(stream(199.5, 190)),
    });
    const change = screen.getByTestId("watchlist-change-AAPL");
    expect(change).toHaveTextContent("+5.00%");
    expect(change).toHaveTextContent("▲");
    expect(change.className).toContain("text-up");
  });

  it("marks the selected row and reports clicks", async () => {
    const onSelect = vi.fn();
    render(<Watchlist watchlist={makeWatchlist()} selected="AAPL" onSelect={onSelect} />, {
      wrapper: withStream(stream(191)),
    });

    expect(screen.getByTestId("watchlist-row-AAPL")).toHaveAttribute("data-selected", "true");
    await userEvent.click(screen.getByTestId("watchlist-row-MSFT"));
    expect(onSelect).toHaveBeenCalledWith("MSFT");
  });

  it("adds a ticker from the form, uppercased", async () => {
    const watchlist = makeWatchlist();
    render(<Watchlist watchlist={watchlist} selected={null} onSelect={vi.fn()} />, {
      wrapper: withStream(makeStream()),
    });

    await userEvent.type(screen.getByTestId("watchlist-add-input"), "pypl");
    await userEvent.click(screen.getByTestId("watchlist-add-button"));
    expect(watchlist.add).toHaveBeenCalledWith("PYPL");
  });

  it("removes a ticker without selecting the row", async () => {
    const watchlist = makeWatchlist();
    const onSelect = vi.fn();
    render(<Watchlist watchlist={watchlist} selected={null} onSelect={onSelect} />, {
      wrapper: withStream(stream(191)),
    });

    await userEvent.click(screen.getByTestId("watchlist-remove-AAPL"));
    expect(watchlist.remove).toHaveBeenCalledWith("AAPL");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("surfaces a watchlist error", () => {
    render(
      <Watchlist
        watchlist={makeWatchlist({ error: "AAPL is already on the watchlist" })}
        selected={null}
        onSelect={vi.fn()}
      />,
      { wrapper: withStream(makeStream()) },
    );
    expect(screen.getByTestId("watchlist-error")).toHaveTextContent("already on the watchlist");
  });
});

describe("price flash", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Keeps the row mounted while the streamed price changes underneath it. */
  function Harness({ price }: { price: number }) {
    return (
      <PriceStreamContext.Provider value={stream(price)}>
        <Watchlist watchlist={makeWatchlist()} selected={null} onSelect={vi.fn()} />
      </PriceStreamContext.Provider>
    );
  }

  const cell = () => screen.getByTestId("watchlist-price-AAPL");

  it("does not flash on the first price seen", () => {
    render(<Harness price={190} />);
    expect(cell().className).not.toContain("flash");
  });

  it("flashes up on an uptick, then clears", () => {
    const { rerender } = render(<Harness price={190} />);
    act(() => rerender(<Harness price={191} />));

    expect(cell().className).toContain("flash-up");

    act(() => vi.advanceTimersByTime(600));
    expect(cell().className).not.toContain("flash");
  });

  it("flashes down on a downtick", () => {
    const { rerender } = render(<Harness price={190} />);
    act(() => rerender(<Harness price={189} />));
    expect(cell().className).toContain("flash-down");
  });

  it("does not flash when the price is unchanged", () => {
    const { rerender } = render(<Harness price={190} />);
    act(() => rerender(<Harness price={190} />));
    expect(cell().className).not.toContain("flash");
  });
});
