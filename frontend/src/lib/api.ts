/**
 * Typed client for the FinAlly backend. Every network call in the app goes
 * through here. Paths are same-origin and relative, so there is no CORS.
 *
 * With NEXT_PUBLIC_MOCK_API=1 the calls resolve against an in-memory mock
 * instead, letting the UI run standalone. The mock is imported dynamically, so
 * it lands in its own chunk that production never fetches.
 */
import type {
  ChatResponse,
  Portfolio,
  PortfolioHistory,
  PortfolioSnapshot,
  TradeExecution,
  TradeRequest,
  WatchlistItem,
  WatchlistResponse,
} from "@/lib/types";

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK_API === "1";

/** An error carrying the backend's `detail` message, ready to show the user. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const mock = () => import("@/lib/mock/backend");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => body?.detail)
      .catch(() => null);
    throw new ApiError(detail ?? `Request failed (${response.status})`, response.status);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export async function fetchPortfolio(): Promise<Portfolio> {
  if (USE_MOCK) return (await mock()).getPortfolio();
  return request<Portfolio>("/portfolio");
}

export async function fetchHistory(): Promise<PortfolioSnapshot[]> {
  if (USE_MOCK) return (await mock()).getHistory();
  const { snapshots } = await request<PortfolioHistory>("/portfolio/history");
  return snapshots;
}

export async function executeTrade(order: TradeRequest): Promise<TradeExecution> {
  if (USE_MOCK) return (await mock()).trade(order);
  return request<TradeExecution>("/portfolio/trade", post(order));
}

export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  if (USE_MOCK) return (await mock()).getWatchlist();
  const { items } = await request<WatchlistResponse>("/watchlist");
  return items;
}

export async function addWatchlistTicker(ticker: string): Promise<WatchlistItem> {
  if (USE_MOCK) return (await mock()).addTicker(ticker);
  return request<WatchlistItem>("/watchlist", post({ ticker }));
}

export async function removeWatchlistTicker(ticker: string): Promise<void> {
  if (USE_MOCK) return (await mock()).removeTicker(ticker);
  return request<void>(`/watchlist/${encodeURIComponent(ticker)}`, { method: "DELETE" });
}

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return (await mock()).chat(message);
  }
  return request<ChatResponse>("/chat", post({ message }));
}
