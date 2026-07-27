"use client";

import { useEffect, useRef, useState } from "react";

const FLASH_MS = 460;

/**
 * Returns the flash class for a price cell for ~500ms after the price moves.
 * The first observed price does not flash - there is nothing to compare to.
 */
export function useFlash(price: number | undefined): string {
  const [tone, setTone] = useState<"up" | "down" | null>(null);
  const previous = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (price === undefined) return;
    const last = previous.current;
    previous.current = price;
    if (last === undefined || price === last) return;

    setTone(price > last ? "up" : "down");
    const timer = setTimeout(() => setTone(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [price]);

  return tone ? `flash-${tone}` : "";
}
