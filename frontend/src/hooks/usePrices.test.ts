import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, applyBatch, sessionChangePercent } from "@/hooks/usePrices";
import { makeUpdate } from "@/test/harness";

const empty: Parameters<typeof applyBatch>[0] = {
  prices: {},
  history: {},
  sessionOpen: {},
};

describe("applyBatch", () => {
  it("records the first previous price as the session open", () => {
    const next = applyBatch(empty, { AAPL: makeUpdate("AAPL", 191, 190) });
    expect(next.sessionOpen.AAPL).toBe(190);
  });

  it("keeps the session open fixed across later ticks", () => {
    const first = applyBatch(empty, { AAPL: makeUpdate("AAPL", 191, 190) });
    const second = applyBatch(first, { AAPL: makeUpdate("AAPL", 195, 191) });
    expect(second.sessionOpen.AAPL).toBe(190);
    expect(second.prices.AAPL.price).toBe(195);
  });

  it("accumulates tick history per ticker", () => {
    const first = applyBatch(empty, { AAPL: makeUpdate("AAPL", 191, 190, 100) });
    const second = applyBatch(first, { AAPL: makeUpdate("AAPL", 192, 191, 101) });
    expect(second.history.AAPL).toEqual([
      { time: 100, value: 191 },
      { time: 101, value: 192 },
    ]);
  });

  it("caps history so a long session cannot grow without bound", () => {
    let state = empty;
    for (let i = 0; i < HISTORY_LIMIT + 40; i++) {
      state = applyBatch(state, { AAPL: makeUpdate("AAPL", 190 + i, 190, i) });
    }
    expect(state.history.AAPL).toHaveLength(HISTORY_LIMIT);
    expect(state.history.AAPL[0].time).toBe(40);
  });

  it("does not mutate the previous state", () => {
    const first = applyBatch(empty, { AAPL: makeUpdate("AAPL", 191, 190) });
    applyBatch(first, { AAPL: makeUpdate("AAPL", 192, 191) });
    expect(first.history.AAPL).toHaveLength(1);
  });

  it("merges tickers arriving in separate batches", () => {
    const first = applyBatch(empty, { AAPL: makeUpdate("AAPL", 191, 190) });
    const second = applyBatch(first, { MSFT: makeUpdate("MSFT", 420, 419) });
    expect(Object.keys(second.prices).sort()).toEqual(["AAPL", "MSFT"]);
  });
});

describe("sessionChangePercent", () => {
  it("measures against the session open, not the previous tick", () => {
    expect(sessionChangePercent(makeUpdate("AAPL", 200, 199), 190)).toBeCloseTo(5.263, 3);
  });

  it("is flat with no data", () => {
    expect(sessionChangePercent(undefined, 190)).toBe(0);
    expect(sessionChangePercent(makeUpdate("AAPL", 200), undefined)).toBe(0);
  });
});
