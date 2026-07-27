"use client";

import { useCallback, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { Header } from "@/components/Header";
import { MainChart } from "@/components/MainChart";
import { PnlChart } from "@/components/PnlChart";
import { PortfolioHeatmap } from "@/components/PortfolioHeatmap";
import { PositionsTable } from "@/components/PositionsTable";
import { TradeBar } from "@/components/TradeBar";
import { Watchlist } from "@/components/Watchlist";
import { PriceStreamProvider, usePriceStream } from "@/hooks/usePrices";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWatchlist } from "@/hooks/useWatchlist";

export function Workstation() {
  return (
    <PriceStreamProvider>
      <Terminal />
    </PriceStreamProvider>
  );
}

/**
 * Three columns: the tape on the left, the analysis stack in the middle, the
 * assistant on the right. The trade bar sits under the analysis stack, where
 * the numbers that inform an order already are.
 */
function Terminal() {
  const { status } = usePriceStream();
  const { portfolio, history, refresh } = usePortfolio();
  const watchlist = useWatchlist();
  const { refresh: refreshWatchlist } = watchlist;
  const [selected, setSelected] = useState<string | null>(null);
  const [tradeSymbol, setTradeSymbol] = useState("");
  const [chatOpen, setChatOpen] = useState(true);

  const active = selected ?? watchlist.tickers[0] ?? null;

  // Selecting a ticker anywhere drives both the chart and the order ticket.
  const select = useCallback((ticker: string) => {
    setSelected(ticker);
    setTradeSymbol(ticker);
  }, []);

  // The assistant can move both the portfolio and the watchlist in one turn,
  // so anything that acts on the user's behalf re-reads both.
  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), refreshWatchlist()]);
  }, [refresh, refreshWatchlist]);

  return (
    <div className="flex h-full flex-col bg-bg" data-testid="workstation">
      <Header
        portfolio={portfolio}
        status={status}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((open) => !open)}
      />

      <main className="flex min-h-0 flex-1 gap-1.5 p-1.5">
        <div className="w-[292px] shrink-0">
          <Watchlist watchlist={watchlist} selected={active} onSelect={select} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="min-h-0 flex-[3]">
            <MainChart ticker={active} />
          </div>

          <div className="flex min-h-0 flex-[2] gap-1.5">
            <div className="min-w-0 flex-1">
              <PortfolioHeatmap portfolio={portfolio} />
            </div>
            <div className="min-w-0 flex-1">
              <PnlChart history={history} liveValue={portfolio.totalValue} />
            </div>
          </div>

          <div className="min-h-0 flex-[2]">
            <PositionsTable portfolio={portfolio} onSelect={select} />
          </div>

          <TradeBar
            symbol={tradeSymbol || active || ""}
            onSymbolChange={setTradeSymbol}
            onTraded={refreshAll}
          />
        </div>

        {chatOpen && <ChatPanel onActions={refreshAll} />}
      </main>
    </div>
  );
}
