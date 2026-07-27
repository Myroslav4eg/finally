/** Number formatting for the terminal. All figures are tabular and signed. */

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "$10,000.00" */
export function usd(value: number): string {
  return currency.format(value);
}

/** "+$120.40" / "-$88.10" - the sign is always explicit. */
export function signedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${currency.format(Math.abs(value))}`;
}

/** "+1.24%" / "-0.30%" */
export function signedPercent(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/** Bare price, "190.42". */
export function price(value: number): string {
  return value.toFixed(2);
}

/** Share counts: whole where possible, up to 4 decimals for fractions. */
export function shares(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

/** Compact volume-style figure for tight cells: "10.3K", "1.2M". */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

/** Direction glyph. Pairs with color so meaning never rests on hue alone. */
export function arrow(value: number): string {
  if (value > 0) return "▲";
  if (value < 0) return "▼";
  return "–";
}

/** Tailwind text color token for a signed value. */
export function toneClass(value: number): string {
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-flat";
}

/** "14:03:22" from unix seconds. */
export function clock(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString("en-US", {
    hour12: false,
  });
}
