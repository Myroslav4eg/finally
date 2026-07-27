/**
 * Wire types for the FinAlly backend. Field names and shapes mirror the
 * Pydantic models in backend/app/schemas.py and backend/app/llm/schemas.py.
 */

/** One ticker's price, as emitted by PriceUpdate.to_dict() on the SSE stream. */
export interface PriceUpdate {
  ticker: string;
  price: number;
  previous_price: number;
  /** Unix seconds. */
  timestamp: number;
  change: number;
  change_percent: number;
  direction: "up" | "down" | "flat";
}

/** The SSE payload: every tracked ticker, keyed by symbol. */
export type PriceMap = Record<string, PriceUpdate>;

export type TradeSide = "buy" | "sell";
export type WatchlistAction = "add" | "remove";
export type ActionStatus = "executed" | "failed";

/** A holding valued at the latest cached price. */
export interface Position {
  ticker: string;
  quantity: number;
  avg_cost: number;
  cost_basis: number;
  /** Null until the ticker has been priced at least once. */
  current_price: number | null;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  weight: number;
}

export interface Portfolio {
  cash_balance: number;
  positions: Position[];
  positions_value: number;
  total_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
}

export interface PortfolioSnapshot {
  total_value: number;
  /** ISO timestamp. */
  recorded_at: string;
}

export interface PortfolioHistory {
  snapshots: PortfolioSnapshot[];
}

export interface TradeRequest {
  ticker: string;
  quantity: number;
  side: TradeSide;
}

export interface TradeRecord {
  id: string;
  ticker: string;
  side: TradeSide;
  quantity: number;
  price: number;
  notional: number;
  executed_at: string;
}

export interface TradeExecution {
  trade: TradeRecord;
  position: Position | null;
  cash_balance: number;
  total_value: number;
}

export interface WatchlistItem {
  ticker: string;
  added_at: string;
  price: number | null;
  previous_price: number | null;
  change: number | null;
  change_percent: number | null;
  direction: string | null;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
}

/** What the assistant did with one proposed trade. */
export interface TradeOutcome {
  ticker: string;
  side: TradeSide;
  quantity: number;
  status: ActionStatus;
  price?: number | null;
  error?: string | null;
}

export interface WatchlistOutcome {
  ticker: string;
  action: WatchlistAction;
  status: ActionStatus;
  error?: string | null;
}

export interface ChatActions {
  trades: TradeOutcome[];
  watchlist_changes: WatchlistOutcome[];
}

export interface ChatResponse {
  message: string;
  actions: ChatActions;
  created_at: string;
}

/** A chat turn as rendered in the panel. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ChatActions;
}

/** EventSource readyState, mapped to something the header can label. */
export type ConnectionState = "connecting" | "live" | "offline";
