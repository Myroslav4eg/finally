import type { DeepPartial, ChartOptions } from "lightweight-charts";

/** Terminal palette for Lightweight Charts. Chrome recedes; the trace leads. */
export const CHART_COLORS = {
  blue: "#209dd7",
  up: "#0f9f79",
  down: "#ef5a66",
  yellow: "#ecad0a",
  panel: "#11161d",
  grid: "#1b2129",
  ink3: "#5f6b7a",
} as const;

export function chartOptions(): DeepPartial<ChartOptions> {
  return {
    autoSize: true,
    layout: {
      background: { color: "transparent" },
      textColor: CHART_COLORS.ink3,
      fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
      fontSize: 10,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: CHART_COLORS.grid },
      horzLines: { color: CHART_COLORS.grid },
    },
    rightPriceScale: { borderColor: CHART_COLORS.grid },
    timeScale: {
      borderColor: CHART_COLORS.grid,
      timeVisible: true,
      secondsVisible: true,
    },
    crosshair: {
      vertLine: { color: CHART_COLORS.ink3, width: 1, style: 2, labelBackgroundColor: "#232b36" },
      horzLine: { color: CHART_COLORS.ink3, width: 1, style: 2, labelBackgroundColor: "#232b36" },
    },
    handleScale: false,
    handleScroll: false,
  };
}

/** Collapse sub-second ticks to one point per second, as the chart requires. */
export function toSeconds<T extends { time: number; value: number }>(
  points: T[],
): { time: number; value: number }[] {
  const bySecond = new Map<number, number>();
  for (const point of points) bySecond.set(Math.floor(point.time), point.value);
  return [...bySecond.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value }));
}
