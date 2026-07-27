import { describe, expect, it } from "vitest";
import { arrow, price, shares, signedPercent, signedUsd, toneClass, usd } from "@/lib/format";

describe("format", () => {
  it("formats currency with two decimals and thousands separators", () => {
    expect(usd(10000)).toBe("$10,000.00");
  });

  it("always shows the sign on signed figures", () => {
    expect(signedUsd(120.4)).toBe("+$120.40");
    expect(signedUsd(-88.1)).toBe("-$88.10");
    expect(signedUsd(0)).toBe("$0.00");
    expect(signedPercent(1.239)).toBe("+1.24%");
    expect(signedPercent(-0.3)).toBe("-0.30%");
  });

  it("pairs direction with a glyph so meaning does not rest on color", () => {
    expect(arrow(1)).toBe("▲");
    expect(arrow(-1)).toBe("▼");
    expect(arrow(0)).toBe("–");
  });

  it("maps sign to a tone class", () => {
    expect(toneClass(1)).toBe("text-up");
    expect(toneClass(-1)).toBe("text-down");
    expect(toneClass(0)).toBe("text-flat");
  });

  it("prints whole share counts plainly and fractions to four places", () => {
    expect(shares(10)).toBe("10");
    expect(shares(0.5)).toBe("0.5000");
  });

  it("prints bare prices to two decimals", () => {
    expect(price(190.4)).toBe("190.40");
  });
});
