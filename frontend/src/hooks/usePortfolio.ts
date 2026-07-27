"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchHistory, fetchPortfolio } from "@/lib/api";
import { valuePortfolio, type LivePortfolio } from "@/lib/portfolio";
import type { Portfolio, PortfolioSnapshot } from "@/lib/types";
import { usePriceStream } from "@/hooks/usePrices";

export interface PortfolioHook {
  portfolio: LivePortfolio;
  history: PortfolioSnapshot[];
  /** Re-read the backend after a trade. */
  refresh: () => Promise<void>;
  loading: boolean;
}

interface Loaded {
  snapshot: Portfolio | null;
  history: PortfolioSnapshot[];
}

const load = () =>
  Promise.all([fetchPortfolio(), fetchHistory()]).then(
    ([snapshot, history]): Loaded => ({ snapshot, history }),
  );

/** Portfolio snapshot from the backend, revalued at live prices on every tick. */
export function usePortfolio(): PortfolioHook {
  const [loaded, setLoaded] = useState<Loaded>({ snapshot: null, history: [] });
  const [loading, setLoading] = useState(true);
  const { prices } = usePriceStream();

  useEffect(() => {
    let active = true;
    void load().then((next) => {
      if (!active) return;
      setLoaded(next);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoaded(await load());
  }, []);

  const portfolio = useMemo(
    () => valuePortfolio(loaded.snapshot, prices),
    [loaded.snapshot, prices],
  );

  return { portfolio, history: loaded.history, refresh, loading };
}
