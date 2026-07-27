"use client";

import { Panel } from "@/components/Panel";
import { useFlash } from "@/hooks/useFlash";
import {
  arrow,
  price as fmtPrice,
  shares,
  signedPercent,
  signedUsd,
  toneClass,
  usd,
} from "@/lib/format";
import type { LivePortfolio, LivePosition } from "@/lib/portfolio";

const COLUMNS = "grid-cols-[62px_74px_80px_80px_96px_78px]";

interface PositionsTableProps {
  portfolio: LivePortfolio;
  onSelect: (ticker: string) => void;
}

export function PositionsTable({ portfolio, onSelect }: PositionsTableProps) {
  return (
    <Panel
      title="Positions"
      testId="positions-panel"
      className="h-full"
      aside={
        <span data-testid="positions-count" className="eyebrow">
          {portfolio.positions.length} open
        </span>
      }
    >
      <div
        role="table"
        aria-label="Open positions"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div
          role="row"
          className={`grid ${COLUMNS} sticky top-0 gap-2 border-b border-line bg-panel px-2.5 py-1`}
        >
          <span className="eyebrow">Symbol</span>
          <span className="eyebrow text-right">Qty</span>
          <span className="eyebrow text-right">Avg cost</span>
          <span className="eyebrow text-right">Last</span>
          <span className="eyebrow text-right">Unreal. P&L</span>
          <span className="eyebrow text-right">Change</span>
        </div>

        {portfolio.positions.length === 0 ? (
          <p className="px-2.5 py-3 text-[11px] text-ink-3">
            No open positions. Use the trade bar below to buy your first.
          </p>
        ) : (
          portfolio.positions.map((position) => (
            <PositionRow key={position.ticker} position={position} onSelect={onSelect} />
          ))
        )}
      </div>
    </Panel>
  );
}

function PositionRow({
  position,
  onSelect,
}: {
  position: LivePosition;
  onSelect: (ticker: string) => void;
}) {
  const flash = useFlash(position.currentPrice);
  const tone = toneClass(position.unrealizedPnl);

  return (
    <div
      role="row"
      tabIndex={0}
      data-testid={`position-row-${position.ticker}`}
      data-ticker={position.ticker}
      onClick={() => onSelect(position.ticker)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect(position.ticker);
      }}
      className={`grid ${COLUMNS} cursor-pointer items-center gap-2 border-b border-line/60 px-2.5 py-1.5 text-xs hover:bg-panel-hi`}
    >
      <span className="font-medium tracking-wider text-ink">{position.ticker}</span>
      <span className="text-right tabular-nums text-ink-2">{shares(position.quantity)}</span>
      <span className="text-right tabular-nums text-ink-2">{usd(position.avgCost)}</span>
      <span
        data-testid={`position-price-${position.ticker}`}
        className={`rounded-sm px-1 text-right tabular-nums text-ink ${flash}`}
      >
        {fmtPrice(position.currentPrice)}
      </span>
      <span
        data-testid={`position-pnl-${position.ticker}`}
        className={`text-right tabular-nums ${tone}`}
      >
        {signedUsd(position.unrealizedPnl)}
      </span>
      <span className={`text-right tabular-nums ${tone}`}>
        <span aria-hidden="true">{arrow(position.unrealizedPnl)} </span>
        {signedPercent(position.unrealizedPnlPercent)}
      </span>
    </div>
  );
}
