import { describe, expect, it } from "vitest";
import { EMPTY_PORTFOLIO, valuePortfolio } from "@/lib/portfolio";
import { makePortfolio, makePosition, makeUpdate } from "@/test/harness";

describe("valuePortfolio", () => {
  it("returns an empty portfolio before the first fetch resolves", () => {
    expect(valuePortfolio(null, {})).toBe(EMPTY_PORTFOLIO);
  });

  it("revalues positions at the live price", () => {
    const live = valuePortfolio(makePortfolio(), { AAPL: makeUpdate("AAPL", 200, 199) });
    const [position] = live.positions;

    expect(position.currentPrice).toBe(200);
    expect(position.marketValue).toBe(2000);
    expect(position.unrealizedPnl).toBeCloseTo(200);
    expect(position.unrealizedPnlPercent).toBeCloseTo(11.111, 3);
    expect(live.totalValue).toBe(7000);
  });

  it("falls back to the fetched price when a ticker is not streaming", () => {
    const live = valuePortfolio(makePortfolio(), {});
    expect(live.positions[0].currentPrice).toBe(190);
    expect(live.totalValue).toBe(6900);
  });

  it("computes weight as a share of total value including cash", () => {
    const live = valuePortfolio(makePortfolio(), { AAPL: makeUpdate("AAPL", 200) });
    expect(live.positions[0].weight).toBeCloseTo(2000 / 7000, 6);
  });

  it("reports a loss when the price falls below average cost", () => {
    const live = valuePortfolio(makePortfolio(), { AAPL: makeUpdate("AAPL", 150, 151) });
    expect(live.positions[0].unrealizedPnl).toBeCloseTo(-300);
    expect(live.unrealizedPnlPercent).toBeCloseTo(-16.667, 3);
  });

  it("sorts positions largest first so the table and heatmap agree", () => {
    const portfolio = makePortfolio({
      positions: [makePosition("AAPL", 1, 100), makePosition("NVDA", 10, 100)],
    });
    const live = valuePortfolio(portfolio, {});
    expect(live.positions.map((p) => p.ticker)).toEqual(["NVDA", "AAPL"]);
  });

  it("handles a cash-only portfolio without dividing by zero", () => {
    const live = valuePortfolio(makePortfolio({ positions: [] }), {});
    expect(live.unrealizedPnlPercent).toBe(0);
    expect(live.totalValue).toBe(5000);
  });
});

describe("valuePortfolio price fallbacks", () => {
  it("uses average cost when a position has never been priced", () => {
    const portfolio = makePortfolio({ positions: [makePosition("PYPL", 4, 60, null)] });
    const live = valuePortfolio(portfolio, {});
    expect(live.positions[0].currentPrice).toBe(60);
    expect(live.positions[0].unrealizedPnl).toBe(0);
  });

  it("trusts the backend cost basis rather than recomputing it", () => {
    const position = { ...makePosition("AAPL", 10, 180, 190), cost_basis: 1700 };
    const live = valuePortfolio(makePortfolio({ positions: [position] }), {});
    expect(live.positions[0].costBasis).toBe(1700);
    expect(live.positions[0].unrealizedPnl).toBe(200);
  });
});
