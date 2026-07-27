"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, LineSeriesPartialOptions, UTCTimestamp } from "lightweight-charts";
import { Panel } from "@/components/Panel";
import { signedPercent, usd } from "@/lib/format";
import { CHART_COLORS, chartOptions } from "@/lib/chartTheme";
import type { PortfolioSnapshot } from "@/lib/types";

const LINE: LineSeriesPartialOptions = {
  color: CHART_COLORS.blue,
  lineWidth: 2,
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerRadius: 4,
  crosshairMarkerBorderColor: CHART_COLORS.panel,
};

interface PnlChartProps {
  history: PortfolioSnapshot[];
  /** Live total, appended so the tail keeps moving between snapshots. */
  liveValue: number;
}

/** Total portfolio value over time, from /api/portfolio/history. */
export function PnlChart({ history, liveValue }: PnlChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Line"> | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let disposed = false;

    void import("lightweight-charts").then(({ createChart, LineSeries }) => {
      if (disposed || !node) return;
      const instance = createChart(node, chartOptions());
      chart.current = instance;
      series.current = instance.addSeries(LineSeries, LINE);
      instance.subscribeCrosshairMove((param) => {
        const point = series.current ? param.seriesData.get(series.current) : undefined;
        setHover(point && "value" in point ? (point.value as number) : null);
      });
      setReady(true);
    });

    return () => {
      disposed = true;
      chart.current?.remove();
      chart.current = null;
      series.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !series.current || history.length === 0) return;
    const points = new Map<number, number>();
    for (const snapshot of history) {
      points.set(Math.floor(Date.parse(snapshot.recorded_at) / 1000), snapshot.total_value);
    }
    const sorted = [...points.entries()].sort((a, b) => a[0] - b[0]);
    series.current.setData(
      sorted.map(([time, value]) => ({ time: time as UTCTimestamp, value })),
    );
    chart.current?.timeScale().fitContent();
  }, [ready, history]);

  const opening = history[0]?.total_value ?? 0;
  const shown = hover ?? liveValue;
  const changePercent = opening === 0 ? 0 : ((liveValue - opening) / opening) * 100;

  return (
    <Panel
      title="Portfolio value"
      testId="pnl-panel"
      className="h-full"
      aside={
        <span className="flex items-baseline gap-3 text-[11px] tabular-nums" data-testid="pnl-readout">
          <span className="text-ink">{usd(shown)}</span>
          <span className={changePercent >= 0 ? "text-up" : "text-down"}>
            {signedPercent(changePercent)}
          </span>
        </span>
      }
    >
      <div ref={container} data-testid="pnl-chart" className="min-h-0 flex-1" />
    </Panel>
  );
}
