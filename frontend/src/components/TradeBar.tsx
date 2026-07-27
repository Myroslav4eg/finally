"use client";

import { useState } from "react";
import { executeTrade } from "@/lib/api";
import { usePriceStream } from "@/hooks/usePrices";
import { price as fmtPrice, usd } from "@/lib/format";
import type { TradeSide } from "@/lib/types";

interface TradeBarProps {
  /** Controlled by the parent so selecting a ticker prefills the order. */
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  onTraded: () => Promise<void>;
}

/** Market orders, instant fill, no confirmation dialog. */
export function TradeBar({ symbol, onSymbolChange, onTraded }: TradeBarProps) {
  const [quantity, setQuantity] = useState("10");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { prices } = usePriceStream();

  const last = prices[symbol]?.price;
  const size = Number(quantity);
  const estimate = last && size > 0 ? last * size : null;

  const submit = async (side: TradeSide) => {
    setNotice(null);
    setPending(true);
    try {
      const { trade } = await executeTrade({ ticker: symbol, quantity: size, side });
      setNotice({
        tone: "ok",
        text: `${side === "buy" ? "Bought" : "Sold"} ${trade.quantity} ${trade.ticker} at ${fmtPrice(trade.price)}`,
      });
      await onTraded();
    } catch (cause) {
      setNotice({ tone: "error", text: (cause as Error).message });
    } finally {
      setPending(false);
    }
  };

  const disabled = pending || !symbol || !(size > 0);

  return (
    <div
      data-testid="trade-bar"
      className="flex h-11 shrink-0 items-center gap-2 border border-line bg-panel px-2.5"
    >
      <span className="eyebrow">Market order</span>

      <input
        data-testid="trade-ticker"
        aria-label="Ticker"
        value={symbol}
        onChange={(event) => onSymbolChange(event.target.value.toUpperCase())}
        maxLength={6}
        className="w-20 border border-line bg-bg px-2 py-1 text-xs tracking-widest text-ink focus:border-blue focus:outline-none"
      />
      <input
        data-testid="trade-quantity"
        aria-label="Quantity"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
        inputMode="decimal"
        className="w-20 border border-line bg-bg px-2 py-1 text-right text-xs tabular-nums text-ink focus:border-blue focus:outline-none"
      />

      <span data-testid="trade-estimate" className="text-[11px] tabular-nums text-ink-3">
        {estimate === null ? "—" : `≈ ${usd(estimate)}`}
      </span>

      <button
        type="button"
        data-testid="trade-buy"
        disabled={disabled}
        onClick={() => submit("buy")}
        className="border border-up/60 bg-up/12 px-4 py-1 font-cond text-[11px] font-semibold uppercase tracking-[0.16em] text-up hover:bg-up/25 disabled:opacity-40"
      >
        Buy
      </button>
      <button
        type="button"
        data-testid="trade-sell"
        disabled={disabled}
        onClick={() => submit("sell")}
        className="border border-down/60 bg-down/12 px-4 py-1 font-cond text-[11px] font-semibold uppercase tracking-[0.16em] text-down hover:bg-down/25 disabled:opacity-40"
      >
        Sell
      </button>

      {notice && (
        <p
          data-testid="trade-notice"
          data-tone={notice.tone}
          role="status"
          className={`truncate text-[11px] ${notice.tone === "ok" ? "text-ink-2" : "text-down"}`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
