import type { Portfolio, PriceMap } from "@/lib/types";

/** A position revalued against the live stream rather than the fetch snapshot. */
export interface LivePosition {
  ticker: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  /** Share of total portfolio value, 0-1. Sizes the heatmap rectangles. */
  weight: number;
}

export interface LivePortfolio {
  cash: number;
  positions: LivePosition[];
  positionsValue: number;
  totalValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

export const EMPTY_PORTFOLIO: LivePortfolio = {
  cash: 0,
  positions: [],
  positionsValue: 0,
  totalValue: 0,
  unrealizedPnl: 0,
  unrealizedPnlPercent: 0,
};

/**
 * Revalue a fetched portfolio at live prices. The backend snapshot supplies
 * quantity, average cost and cash; the price stream supplies everything else,
 * so the header total ticks with the market between fetches.
 */
export function valuePortfolio(
  portfolio: Portfolio | null,
  prices: PriceMap,
): LivePortfolio {
  if (!portfolio) return EMPTY_PORTFOLIO;

  const positions = portfolio.positions.map((position) => {
    const currentPrice =
      prices[position.ticker]?.price ?? position.current_price ?? position.avg_cost;
    const marketValue = currentPrice * position.quantity;
    const costBasis = position.cost_basis;
    const unrealizedPnl = marketValue - costBasis;
    return {
      ticker: position.ticker,
      quantity: position.quantity,
      avgCost: position.avg_cost,
      currentPrice,
      marketValue,
      costBasis,
      unrealizedPnl,
      unrealizedPnlPercent: costBasis === 0 ? 0 : (unrealizedPnl / costBasis) * 100,
      weight: 0,
    };
  });

  const positionsValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const costBasis = positions.reduce((sum, p) => sum + p.costBasis, 0);
  const unrealizedPnl = positionsValue - costBasis;
  const totalValue = portfolio.cash_balance + positionsValue;

  for (const position of positions) {
    position.weight = totalValue === 0 ? 0 : position.marketValue / totalValue;
  }
  positions.sort((a, b) => b.marketValue - a.marketValue);

  return {
    cash: portfolio.cash_balance,
    positions,
    positionsValue,
    totalValue,
    unrealizedPnl,
    unrealizedPnlPercent: costBasis === 0 ? 0 : (unrealizedPnl / costBasis) * 100,
  };
}
