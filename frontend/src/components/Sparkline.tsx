"use client";

import { useId } from "react";

interface SparklineProps {
  values: number[];
  tone: "up" | "down" | "flat";
  className?: string;
}

const STROKE: Record<SparklineProps["tone"], string> = {
  up: "var(--color-up)",
  down: "var(--color-down)",
  flat: "var(--color-flat)",
};

/** The trace occupies the lower band of its box so row text stays legible. */
const BASELINE = 98;
const AMPLITUDE = 30;

/**
 * The session's price trace, drawn edge to edge so a watchlist row reads as a
 * live trace rather than a table cell. No axes, no labels: the row's own
 * price and change carry the numbers.
 */
export function Sparkline({ values, tone, className = "" }: SparklineProps) {
  const gradientId = useId();
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 100 / (values.length - 1);

  const points = values.map((value, index) => {
    const x = index * step;
    const y = BASELINE - ((value - min) / span) * AMPLITUDE;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={STROKE[tone]} stopOpacity="0.3" />
          <stop offset="100%" stopColor={STROKE[tone]} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={`0,100 ${points.join(" ")} 100,100`} fill={`url(#${gradientId})`} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={STROKE[tone]}
        strokeWidth="1.2"
        strokeOpacity="0.6"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
