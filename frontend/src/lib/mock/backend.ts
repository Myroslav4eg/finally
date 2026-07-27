/**
 * In-memory stand-in for the FastAPI backend, used only when
 * NEXT_PUBLIC_MOCK_API=1 so the UI can be developed and eyeballed before the
 * real backend exists. It mirrors the contract in PLAN.md section 8 exactly.
 */
import { nextId } from "@/lib/id";
import type {
  ChatResponse,
  Portfolio,
  PortfolioSnapshot,
  Position,
  PriceMap,
  PriceUpdate,
  TradeRequest,
  TradeExecution,
  WatchlistItem,
} from "@/lib/types";

const SEED_PRICES: Record<string, number> = {
  AAPL: 190,
  GOOGL: 175,
  MSFT: 420,
  AMZN: 185,
  TSLA: 250,
  NVDA: 800,
  META: 500,
  JPM: 195,
  V: 280,
  NFLX: 600,
};

const VOL: Record<string, number> = {
  TSLA: 0.5,
  NVDA: 0.4,
  NFLX: 0.35,
  META: 0.3,
  AMZN: 0.28,
  GOOGL: 0.25,
  AAPL: 0.22,
  MSFT: 0.2,
  JPM: 0.18,
  V: 0.17,
};

const TICK_SECONDS = 0.5;
const YEAR_SECONDS = 252 * 6.5 * 3600;

interface Holding {
  quantity: number;
  avgCost: number;
}

const state = {
  cash: 10000,
  watchlist: Object.keys(SEED_PRICES),
  holdings: new Map<string, Holding>([
    ["AAPL", { quantity: 12, avgCost: 184.2 }],
    ["NVDA", { quantity: 3, avgCost: 845.0 }],
    ["JPM", { quantity: 20, avgCost: 191.5 }],
  ]),
  prices: new Map<string, { price: number; previous: number }>(),
  snapshots: [] as PortfolioSnapshot[],
};

for (const [ticker, seed] of Object.entries(SEED_PRICES)) {
  state.prices.set(ticker, { price: seed, previous: seed });
}

/** Box-Muller standard normal. */
function gauss(): number {
  const u = Math.random() || 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

/** Advance every tracked price one geometric Brownian motion step. */
export function stepPrices(): PriceMap {
  const dt = TICK_SECONDS / YEAR_SECONDS;
  const market = gauss();
  const out: PriceMap = {};

  for (const ticker of state.watchlist) {
    const entry = state.prices.get(ticker);
    if (!entry) continue;
    const sigma = VOL[ticker] ?? 0.25;
    // 60% common market factor, 40% idiosyncratic - tickers move together.
    const shock = 0.6 * market + 0.4 * gauss();
    const drift = (0.05 - (sigma * sigma) / 2) * dt;
    const next = entry.price * Math.exp(drift + sigma * Math.sqrt(dt) * shock);
    const rounded = Math.round(next * 100) / 100;
    state.prices.set(ticker, { price: rounded, previous: entry.price });
    out[ticker] = toUpdate(ticker, rounded, entry.price);
  }
  return out;
}

function toUpdate(ticker: string, value: number, previous: number): PriceUpdate {
  const change = Math.round((value - previous) * 10000) / 10000;
  return {
    ticker,
    price: value,
    previous_price: previous,
    timestamp: Date.now() / 1000,
    change,
    change_percent: previous === 0 ? 0 : Math.round((change / previous) * 1000000) / 10000,
    direction: value > previous ? "up" : value < previous ? "down" : "flat",
  };
}

function priceOf(ticker: string): number {
  return state.prices.get(ticker)?.price ?? SEED_PRICES[ticker] ?? 100;
}

function buildPositions(totalValue = 0): Position[] {
  return [...state.holdings.entries()].map(([ticker, h]) => {
    const current = priceOf(ticker);
    const marketValue = current * h.quantity;
    const cost = h.avgCost * h.quantity;
    return {
      ticker,
      quantity: h.quantity,
      avg_cost: h.avgCost,
      cost_basis: cost,
      current_price: current,
      market_value: marketValue,
      unrealized_pnl: marketValue - cost,
      unrealized_pnl_percent: cost === 0 ? 0 : ((marketValue - cost) / cost) * 100,
      weight: totalValue === 0 ? 0 : marketValue / totalValue,
    };
  });
}

export function getPortfolio(): Portfolio {
  const draft = buildPositions();
  const positionsValue = draft.reduce((sum, p) => sum + p.market_value, 0);
  const totalValue = state.cash + positionsValue;
  const cost = draft.reduce((sum, p) => sum + p.cost_basis, 0);
  const pnl = positionsValue - cost;
  return {
    cash_balance: state.cash,
    positions: buildPositions(totalValue),
    positions_value: positionsValue,
    total_value: totalValue,
    unrealized_pnl: pnl,
    unrealized_pnl_percent: cost === 0 ? 0 : (pnl / cost) * 100,
  };
}

export function getHistory(): PortfolioSnapshot[] {
  if (state.snapshots.length === 0) {
    const now = Date.now();
    // Walk backwards from the current valuation so the chart joins up with it.
    let value = getPortfolio().total_value * 0.985;
    for (let i = 60; i >= 0; i--) {
      value += (Math.random() - 0.42) * 90;
      state.snapshots.push({
        total_value: Math.round(value * 100) / 100,
        recorded_at: new Date(now - i * 30000).toISOString(),
      });
    }
  }
  return state.snapshots;
}

export function recordSnapshot(): void {
  getHistory().push({
    total_value: getPortfolio().total_value,
    recorded_at: new Date().toISOString(),
  });
}

function watchlistItem(ticker: string): WatchlistItem {
  const entry = state.prices.get(ticker);
  const update = entry ? toUpdate(ticker, entry.price, entry.previous) : null;
  return {
    ticker,
    added_at: new Date().toISOString(),
    price: update?.price ?? null,
    previous_price: update?.previous_price ?? null,
    change: update?.change ?? null,
    change_percent: update?.change_percent ?? null,
    direction: update?.direction ?? null,
  };
}

export function getWatchlist(): WatchlistItem[] {
  return state.watchlist.map(watchlistItem);
}

export function addTicker(ticker: string): WatchlistItem {
  const symbol = ticker.toUpperCase();
  if (state.watchlist.includes(symbol)) throw new Error(`${symbol} is already on the watchlist`);
  state.watchlist.push(symbol);
  const seed = SEED_PRICES[symbol] ?? 50 + Math.random() * 250;
  state.prices.set(symbol, { price: Math.round(seed * 100) / 100, previous: seed });
  return watchlistItem(symbol);
}

export function removeTicker(ticker: string): void {
  state.watchlist = state.watchlist.filter((t) => t !== ticker.toUpperCase());
}

export function trade({ ticker, quantity, side }: TradeRequest): TradeExecution {
  const symbol = ticker.toUpperCase();
  if (quantity <= 0) throw new Error("Quantity must be greater than zero");

  const fill = priceOf(symbol);
  const notional = fill * quantity;
  const holding = state.holdings.get(symbol);

  if (side === "buy") {
    if (notional > state.cash) {
      throw new Error(`Not enough cash: ${symbol} costs ${notional.toFixed(2)}`);
    }
    state.cash -= notional;
    const qty = (holding?.quantity ?? 0) + quantity;
    const cost = (holding?.avgCost ?? 0) * (holding?.quantity ?? 0) + notional;
    state.holdings.set(symbol, { quantity: qty, avgCost: cost / qty });
  } else {
    if (!holding || holding.quantity < quantity) {
      throw new Error(`Not enough shares of ${symbol} to sell`);
    }
    state.cash += notional;
    const qty = holding.quantity - quantity;
    if (qty <= 0) state.holdings.delete(symbol);
    else state.holdings.set(symbol, { ...holding, quantity: qty });
  }

  recordSnapshot();
  const portfolio = getPortfolio();
  return {
    trade: {
      id: nextId("trade"),
      ticker: symbol,
      side,
      quantity,
      price: fill,
      notional,
      executed_at: new Date().toISOString(),
    },
    position: portfolio.positions.find((p) => p.ticker === symbol) ?? null,
    cash_balance: portfolio.cash_balance,
    total_value: portfolio.total_value,
  };
}

/** A canned assistant reply so the chat panel can be exercised end to end. */
export function chat(message: string): ChatResponse {
  const portfolio = getPortfolio();
  const buy = /buy\s+(\d+(?:\.\d+)?)\s+([a-z]{1,5})/i.exec(message);

  const now = new Date().toISOString();

  if (buy) {
    const quantity = Number(buy[1]);
    const ticker = buy[2].toUpperCase();
    try {
      const { trade: fill, cash_balance } = trade({ ticker, quantity, side: "buy" });
      return {
        message: `Bought ${quantity} ${ticker} at ${fill.price.toFixed(2)}. Cash is now ${cash_balance.toFixed(2)}.`,
        actions: {
          trades: [{ ticker, side: "buy", quantity, status: "executed", price: fill.price }],
          watchlist_changes: [],
        },
        created_at: now,
      };
    } catch (error) {
      return {
        message: `I could not place that order. ${(error as Error).message}.`,
        actions: {
          trades: [
            { ticker, side: "buy", quantity, status: "failed", error: (error as Error).message },
          ],
          watchlist_changes: [],
        },
        created_at: now,
      };
    }
  }

  const biggest = [...portfolio.positions].sort(
    (a, b) => b.market_value - a.market_value,
  )[0];
  return {
    message: biggest
      ? `Your portfolio is worth ${portfolio.total_value.toFixed(2)}, with ${portfolio.cash_balance.toFixed(2)} in cash. ${biggest.ticker} is your largest position at ${biggest.market_value.toFixed(2)}, running ${biggest.unrealized_pnl >= 0 ? "up" : "down"} ${Math.abs(biggest.unrealized_pnl_percent).toFixed(2)}%.`
      : `You hold no positions. You have ${portfolio.cash_balance.toFixed(2)} in cash to deploy.`,
    actions: { trades: [], watchlist_changes: [] },
    created_at: now,
  };
}
