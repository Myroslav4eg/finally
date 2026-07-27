import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWatchlist } from "@/hooks/useWatchlist";
import { addWatchlistTicker, fetchWatchlist, removeWatchlistTicker } from "@/lib/api";
import type { WatchlistItem } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  fetchWatchlist: vi.fn(),
  addWatchlistTicker: vi.fn(),
  removeWatchlistTicker: vi.fn(),
}));

const fetched = vi.mocked(fetchWatchlist);
const added = vi.mocked(addWatchlistTicker);
const removed = vi.mocked(removeWatchlistTicker);

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

async function mounted(initial: string[]) {
  fetched.mockResolvedValue(items(...initial));
  const view = renderHook(() => useWatchlist());
  await waitFor(() => expect(view.result.current.tickers).toEqual(initial));
  return view;
}

describe("useWatchlist", () => {
  it("loads the watchlist on mount", async () => {
    const { result } = await mounted(["AAPL", "MSFT"]);
    expect(result.current.tickers).toEqual(["AAPL", "MSFT"]);
  });

  it("adds a ticker and re-reads the list", async () => {
    const { result } = await mounted(["AAPL"]);
    added.mockResolvedValue(items("PYPL")[0]);
    fetched.mockResolvedValue(items("AAPL", "PYPL"));

    await act(() => result.current.add("pypl"));

    expect(added).toHaveBeenCalledWith("PYPL");
    expect(result.current.tickers).toEqual(["AAPL", "PYPL"]);
  });

  it("removes a ticker and re-reads the list", async () => {
    const { result } = await mounted(["AAPL", "MSFT"]);
    removed.mockResolvedValue(undefined);
    fetched.mockResolvedValue(items("AAPL"));

    await act(() => result.current.remove("MSFT"));

    expect(removed).toHaveBeenCalledWith("MSFT");
    expect(result.current.tickers).toEqual(["AAPL"]);
  });

  it("surfaces the backend message when an add fails", async () => {
    const { result } = await mounted(["AAPL"]);
    added.mockRejectedValue(new Error("AAPL is already on the watchlist"));

    await act(() => result.current.add("AAPL"));

    expect(result.current.error).toBe("AAPL is already on the watchlist");
  });

  it("ignores a blank symbol", async () => {
    const { result } = await mounted(["AAPL"]);
    const before = added.mock.calls.length;
    await act(() => result.current.add("   "));
    expect(added.mock.calls.length).toBe(before);
  });

  /**
   * Regression for DEFECT-2. The assistant can change the watchlist behind the
   * hook's back, so the hook has to expose a way to re-read it.
   */
  it("re-reads the watchlist on refresh, picking up an outside change", async () => {
    const { result } = await mounted(["AAPL"]);
    fetched.mockResolvedValue(items("AAPL", "PYPL"));

    await act(() => result.current.refresh());

    expect(result.current.tickers).toEqual(["AAPL", "PYPL"]);
  });
});
