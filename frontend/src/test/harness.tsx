import type { ReactNode } from "react";
import { PriceStreamContext, type PriceStream } from "@/hooks/usePrices";
import type { Portfolio, Position, PriceUpdate } from "@/lib/types";

/** Build a PriceUpdate the way the backend serializes one. */
export function makeUpdate(
  ticker: string,
  price: number,
  previous = price,
  timestamp = 1_700_000_000,
): PriceUpdate {
  return {
    ticker,
    price,
    previous_price: previous,
    timestamp,
    change: price - previous,
    change_percent: previous === 0 ? 0 : ((price - previous) / previous) * 100,
    direction: price > previous ? "up" : price < previous ? "down" : "flat",
  };
}

export function makeStream(overrides: Partial<PriceStream> = {}): PriceStream {
  return {
    prices: {},
    history: {},
    sessionOpen: {},
    status: "live",
    ...overrides,
  };
}

/** Wrap a component in a fixed price stream - no EventSource is opened. */
export function withStream(stream: PriceStream) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PriceStreamContext.Provider value={stream}>{children}</PriceStreamContext.Provider>
    );
  };
}

/** A holding as the backend values it, priced at `currentPrice`. */
export function makePosition(
  ticker: string,
  quantity: number,
  avgCost: number,
  currentPrice: number | null = avgCost,
): Position {
  const costBasis = avgCost * quantity;
  const marketValue = (currentPrice ?? avgCost) * quantity;
  return {
    ticker,
    quantity,
    avg_cost: avgCost,
    cost_basis: costBasis,
    current_price: currentPrice,
    market_value: marketValue,
    unrealized_pnl: marketValue - costBasis,
    unrealized_pnl_percent: costBasis === 0 ? 0 : ((marketValue - costBasis) / costBasis) * 100,
    weight: 0,
  };
}

export function makePortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    cash_balance: 5000,
    positions: [makePosition("AAPL", 10, 180, 190)],
    positions_value: 1900,
    total_value: 6900,
    unrealized_pnl: 100,
    unrealized_pnl_percent: 5.56,
    ...overrides,
  };
}
