"use client";

import { useEffect, useRef, useState } from "react";
import type { AreaSeriesPartialOptions, IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { Panel } from "@/components/Panel";
import { sessionChangePercent, usePriceStream } from "@/hooks/usePrices";
import { arrow, price as fmtPrice, signedPercent, toneClass } from "@/lib/format";
import { CHART_COLORS, chartOptions, toSeconds } from "@/lib/chartTheme";

const AREA: AreaSeriesPartialOptions = {
  lineColor: CHART_COLORS.blue,
  lineWidth: 2,
  topColor: "rgba(32, 157, 215, 0.22)",
  bottomColor: "rgba(32, 157, 215, 0)",
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerRadius: 4,
  crosshairMarkerBorderColor: CHART_COLORS.panel,
  crosshairMarkerBackgroundColor: CHART_COLORS.blue,
};

/**
 * The selected ticker's price since page load. The chart instance is created
 * once and fed through the library's update API, so a 500ms tick never
 * re-renders React or rebuilds the canvas.
 */
export function MainChart({ ticker }: { ticker: string | null }) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const lastTime = useRef(0);
  const [hover, setHover] = useState<number | null>(null);

  const { prices, history, sessionOpen } = usePriceStream();
  const update = ticker ? prices[ticker] : undefined;
  const change = sessionChangePercent(update, ticker ? sessionOpen[ticker] : undefined);

  // Create the chart once. Lightweight Charts is loaded lazily so it never
  // runs during the static export's prerender.
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let disposed = false;

    void import("lightweight-charts").then(({ createChart, AreaSeries }) => {
      if (disposed || !node) return;
      const instance = createChart(node, chartOptions());
      chart.current = instance;
      series.current = instance.addSeries(AreaSeries, AREA);
      instance.subscribeCrosshairMove((param) => {
        const point = series.current ? param.seriesData.get(series.current) : undefined;
        setHover(point && "value" in point ? (point.value as number) : null);
      });
    });

    return () => {
      disposed = true;
      chart.current?.remove();
      chart.current = null;
      series.current = null;
    };
  }, []);

  // Seed from the session history whenever the selection changes.
  useEffect(() => {
    if (!ticker) return;
    const points = toSeconds(history[ticker] ?? []);
    lastTime.current = 0;

    const seed = () => {
      if (!series.current || points.length === 0) return false;
      series.current.setData(
        points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      lastTime.current = points[points.length - 1].time;
      chart.current?.timeScale().fitContent();
      return true;
    };

    if (seed()) return;
    // The chart module may still be loading on first paint.
    const retry = setInterval(() => {
      if (seed()) clearInterval(retry);
    }, 120);
    return () => clearInterval(retry);
    // History is a live buffer; reseeding on every tick would defeat update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // Feed each tick straight to the series.
  useEffect(() => {
    if (!update || !series.current) return;
    const time = Math.floor(update.timestamp);
    if (time < lastTime.current) return;
    lastTime.current = time;
    series.current.update({ time: time as UTCTimestamp, value: update.price });
  }, [update]);

  const shown = hover ?? update?.price;

  return (
    <Panel
      title={ticker ? `${ticker} · session` : "Select a symbol"}
      testId="main-chart-panel"
      className="h-full"
      aside={
        <span className="flex items-baseline gap-3" data-testid="main-chart-readout">
          <span className="text-xs tabular-nums text-ink">
            {shown === undefined ? "—" : fmtPrice(shown)}
          </span>
          <span className={`text-[11px] tabular-nums ${toneClass(change)}`}>
            <span aria-hidden="true">{arrow(change)} </span>
            {signedPercent(change)}
          </span>
        </span>
      }
    >
      <div ref={container} data-testid="main-chart" className="min-h-0 flex-1" />
    </Panel>
  );
}
