"use client";

import { useCallback, useEffect, useState } from "react";
import { addWatchlistTicker, fetchWatchlist, removeWatchlistTicker } from "@/lib/api";

export interface WatchlistHook {
  tickers: string[];
  add: (ticker: string) => Promise<void>;
  remove: (ticker: string) => Promise<void>;
  /** Re-read the backend after something else changed the watchlist. */
  refresh: () => Promise<void>;
  error: string | null;
}

const load = () => fetchWatchlist().then((items) => items.map((item) => item.ticker));

export function useWatchlist(): WatchlistHook {
  const [tickers, setTickers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void load().then((next) => {
      if (active) setTickers(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const mutate = useCallback(async (change: () => Promise<unknown>) => {
    setError(null);
    try {
      await change();
      setTickers(await load());
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  const add = useCallback(
    async (ticker: string) => {
      const symbol = ticker.trim().toUpperCase();
      if (symbol) await mutate(() => addWatchlistTicker(symbol));
    },
    [mutate],
  );

  const remove = useCallback(
    async (ticker: string) => mutate(() => removeWatchlistTicker(ticker)),
    [mutate],
  );

  const refresh = useCallback(async () => {
    setTickers(await load());
  }, []);

  return { tickers, add, remove, refresh, error };
}
