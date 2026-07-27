"use client";

import { useState, type FormEvent } from "react";
import { Panel } from "@/components/Panel";
import { Sparkline } from "@/components/Sparkline";
import { useFlash } from "@/hooks/useFlash";
import { sessionChangePercent, usePriceStream } from "@/hooks/usePrices";
import type { WatchlistHook } from "@/hooks/useWatchlist";
import { arrow, price as fmtPrice, signedPercent, toneClass } from "@/lib/format";

const SPARK_POINTS = 44;

interface WatchlistProps {
  watchlist: WatchlistHook;
  selected: string | null;
  onSelect: (ticker: string) => void;
}

export function Watchlist({ watchlist, selected, onSelect }: WatchlistProps) {
  const [draft, setDraft] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await watchlist.add(draft);
    setDraft("");
  };

  return (
    <Panel
      title="Watchlist"
      testId="watchlist-panel"
      className="h-full"
      aside={
        <span data-testid="watchlist-count" className="eyebrow">
          {watchlist.tickers.length} symbols
        </span>
      }
    >
      <div className="grid grid-cols-[1fr_84px_84px_20px] gap-2 border-b border-line px-2.5 py-1">
        <span className="eyebrow">Symbol</span>
        <span className="eyebrow text-right">Last</span>
        <span className="eyebrow text-right">Session</span>
        <span />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="watchlist-rows">
        {watchlist.tickers.map((ticker) => (
          <WatchlistRow
            key={ticker}
            ticker={ticker}
            selected={ticker === selected}
            onSelect={onSelect}
            onRemove={watchlist.remove}
          />
        ))}
      </div>

      <form
        onSubmit={submit}
        className="flex shrink-0 items-center gap-1.5 border-t border-line p-2"
      >
        <input
          data-testid="watchlist-add-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          placeholder="ADD SYMBOL"
          maxLength={6}
          aria-label="Add symbol to watchlist"
          className="min-w-0 flex-1 border border-line bg-bg px-2 py-1 text-xs tracking-widest text-ink placeholder:text-ink-3 focus:border-blue focus:outline-none"
        />
        <button
          type="submit"
          data-testid="watchlist-add-button"
          className="border border-line-hi px-2.5 py-1 font-cond text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-2 hover:border-blue hover:text-ink"
        >
          Add
        </button>
      </form>

      {watchlist.error && (
        <p data-testid="watchlist-error" className="border-t border-line px-2.5 py-1 text-[11px] text-down">
          {watchlist.error}
        </p>
      )}
    </Panel>
  );
}

interface RowProps {
  ticker: string;
  selected: boolean;
  onSelect: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}

function WatchlistRow({ ticker, selected, onSelect, onRemove }: RowProps) {
  const { prices, history, sessionOpen } = usePriceStream();
  const update = prices[ticker];
  const flash = useFlash(update?.price);

  const change = sessionChangePercent(update, sessionOpen[ticker]);
  const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const values = (history[ticker] ?? []).slice(-SPARK_POINTS).map((point) => point.value);

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`watchlist-row-${ticker}`}
      data-ticker={ticker}
      data-selected={selected}
      aria-pressed={selected}
      onClick={() => onSelect(ticker)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(ticker);
        }
      }}
      className={`group relative grid h-9 cursor-pointer grid-cols-[1fr_84px_84px_20px] items-center gap-2 border-b border-line/60 px-2.5 text-xs ${
        selected ? "bg-panel-hi" : "hover:bg-panel-hi/60"
      }`}
    >
      <Sparkline
        values={values}
        tone={tone}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-yellow" aria-hidden="true" />}

      <span className="relative font-medium tracking-wider text-ink">{ticker}</span>

      <span
        data-testid={`watchlist-price-${ticker}`}
        className={`relative rounded-sm px-1 text-right tabular-nums text-ink ${flash}`}
      >
        {update ? fmtPrice(update.price) : "—"}
      </span>

      <span
        data-testid={`watchlist-change-${ticker}`}
        className={`relative text-right tabular-nums ${toneClass(change)}`}
      >
        <span aria-hidden="true">{arrow(change)} </span>
        {signedPercent(change)}
      </span>

      <button
        type="button"
        data-testid={`watchlist-remove-${ticker}`}
        aria-label={`Remove ${ticker} from watchlist`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove(ticker);
        }}
        className="relative text-ink-3 opacity-0 group-hover:opacity-100 hover:text-down focus-visible:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
