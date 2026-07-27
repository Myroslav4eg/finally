"use client";

/**
 * The single live price source for the app. One EventSource on
 * /api/stream/prices feeds every panel; nothing else opens a stream.
 *
 * EventSource reconnects on its own, so the connection state here just
 * reflects readyState rather than reimplementing retry.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { USE_MOCK } from "@/lib/api";
import type { ConnectionState, PriceMap, PriceUpdate } from "@/lib/types";

/** One observed tick. Time is unix seconds, as the backend sends it. */
export interface PricePoint {
  time: number;
  value: number;
}

/** Ticks kept per ticker since page load - about four minutes at 500ms. */
export const HISTORY_LIMIT = 500;

interface StreamData {
  prices: PriceMap;
  /** Tick history accumulated on the client since page load. */
  history: Record<string, PricePoint[]>;
  /** First price seen this session, the basis for session change %. */
  sessionOpen: Record<string, number>;
}

export interface PriceStream extends StreamData {
  status: ConnectionState;
}

const EMPTY: StreamData = { prices: {}, history: {}, sessionOpen: {} };

/** Exported so tests can supply a fixed stream without opening a connection. */
export const PriceStreamContext = createContext<PriceStream>({
  ...EMPTY,
  status: "connecting",
});

/** Fold one SSE batch into the accumulated stream data. */
export function applyBatch(current: StreamData, batch: PriceMap): StreamData {
  const history = { ...current.history };
  const sessionOpen = { ...current.sessionOpen };

  for (const [ticker, update] of Object.entries(batch)) {
    if (sessionOpen[ticker] === undefined) sessionOpen[ticker] = update.previous_price;
    const points = history[ticker] ?? [];
    const next = [...points, { time: update.timestamp, value: update.price }];
    history[ticker] = next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT) : next;
  }

  return { prices: { ...current.prices, ...batch }, history, sessionOpen };
}

export function PriceStreamProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StreamData>(EMPTY);
  const [status, setStatus] = useState<ConnectionState>("connecting");

  useEffect(() => {
    const ingest = (batch: PriceMap) => setData((current) => applyBatch(current, batch));

    if (USE_MOCK) return startMockStream(ingest, setStatus);

    const source = new EventSource("/api/stream/prices");
    source.onopen = () => setStatus("live");
    source.onmessage = (event) => ingest(JSON.parse(event.data) as PriceMap);
    source.onerror = () =>
      setStatus(source.readyState === EventSource.CLOSED ? "offline" : "connecting");

    return () => source.close();
  }, []);

  const value = useMemo<PriceStream>(() => ({ ...data, status }), [data, status]);

  return <PriceStreamContext.Provider value={value}>{children}</PriceStreamContext.Provider>;
}

/** Drives the UI from the in-memory mock when NEXT_PUBLIC_MOCK_API=1. */
function startMockStream(
  ingest: (batch: PriceMap) => void,
  setStatus: (state: ConnectionState) => void,
) {
  let timer: ReturnType<typeof setInterval> | undefined;
  void import("@/lib/mock/backend").then(({ stepPrices }) => {
    setStatus("live");
    ingest(stepPrices());
    timer = setInterval(() => ingest(stepPrices()), 500);
  });
  return () => clearInterval(timer);
}

export function usePriceStream(): PriceStream {
  return useContext(PriceStreamContext);
}

export function usePrice(ticker: string | null): PriceUpdate | undefined {
  const { prices } = usePriceStream();
  return ticker ? prices[ticker] : undefined;
}

/**
 * Change since the first price observed this session. The stream reports
 * tick-to-tick change; a daily open is not on the wire, so the session open
 * is the honest baseline for a change column.
 */
export function sessionChangePercent(
  update: PriceUpdate | undefined,
  open: number | undefined,
): number {
  if (!update || !open) return 0;
  return ((update.price - open) / open) * 100;
}
