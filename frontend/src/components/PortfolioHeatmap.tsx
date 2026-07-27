"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/Panel";
import { signedPercent, signedUsd, usd } from "@/lib/format";
import type { LivePortfolio, LivePosition } from "@/lib/portfolio";
import { squarify } from "@/lib/treemap";

/** P&L beyond this magnitude saturates the fill. */
const SCALE_PERCENT = 5;

/**
 * Diverging fill: loss and gain poles mixed toward the panel surface, with a
 * neutral surface at zero. Cells always carry their signed number too, so the
 * red/green pair is never the only channel.
 */
function fill(pnlPercent: number): string {
  const magnitude = Math.min(Math.abs(pnlPercent) / SCALE_PERCENT, 1);
  const strength = 14 + magnitude * 58;
  if (Math.abs(pnlPercent) < 0.005) return "var(--color-panel-hi)";
  const pole = pnlPercent > 0 ? "var(--color-up)" : "var(--color-down)";
  return `color-mix(in srgb, ${pole} ${strength.toFixed(0)}%, var(--color-bg))`;
}

export function PortfolioHeatmap({ portfolio }: { portfolio: LivePortfolio }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const rects = useMemo(
    () =>
      squarify(
        portfolio.positions.map((position) => ({
          key: position.ticker,
          value: position.marketValue,
        })),
        0.9,
      ),
    [portfolio.positions],
  );

  const byTicker = new Map(portfolio.positions.map((p) => [p.ticker, p]));
  const detail = hovered ? byTicker.get(hovered) : undefined;

  return (
    <Panel
      title="Allocation"
      testId="heatmap-panel"
      className="h-full"
      aside={detail ? <HeatmapReadout position={detail} /> : <Legend />}
    >
      <div className="relative min-h-0 flex-1 p-1" data-testid="heatmap">
        {rects.length === 0 && (
          <p className="flex h-full items-center justify-center text-[11px] text-ink-3">
            No positions yet. Buy something to fill this map.
          </p>
        )}
        {rects.map((rect) => {
          const position = byTicker.get(rect.key);
          if (!position) return null;
          return (
            <div
              key={rect.key}
              data-testid={`heatmap-cell-${rect.key}`}
              data-pnl={position.unrealizedPnl.toFixed(2)}
              onMouseEnter={() => setHovered(rect.key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                left: `${rect.x}%`,
                top: `${rect.y}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`,
                backgroundColor: fill(position.unrealizedPnlPercent),
              }}
              className="absolute flex flex-col justify-center overflow-hidden px-1.5 py-1 text-center leading-tight"
            >
              <span className="truncate text-[11px] font-medium tracking-wider text-ink">
                {rect.key}
              </span>
              <span className="truncate text-[10px] tabular-nums text-ink-2">
                {signedPercent(position.unrealizedPnlPercent, 1)}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function HeatmapReadout({ position }: { position: LivePosition }) {
  return (
    <span className="flex items-baseline gap-2 text-[11px] tabular-nums">
      <span className="text-ink">{position.ticker}</span>
      <span className="text-ink-2">{usd(position.marketValue)}</span>
      <span className={position.unrealizedPnl >= 0 ? "text-up" : "text-down"}>
        {signedUsd(position.unrealizedPnl)}
      </span>
    </span>
  );
}

/** Diverging key: the two poles and the neutral midpoint, labelled. */
function Legend() {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      <span className="eyebrow">Loss</span>
      <span className="h-2 w-16 bg-gradient-to-r from-down via-flat to-up opacity-80" />
      <span className="eyebrow">Gain</span>
    </span>
  );
}
