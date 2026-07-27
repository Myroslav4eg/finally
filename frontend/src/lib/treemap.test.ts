import { describe, expect, it } from "vitest";
import { squarify } from "@/lib/treemap";

const total = (rects: { width: number; height: number }[]) =>
  rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);

describe("squarify", () => {
  it("returns nothing when there is no value to lay out", () => {
    expect(squarify([])).toEqual([]);
    expect(squarify([{ key: "AAPL", value: 0 }])).toEqual([]);
  });

  it("fills the whole box", () => {
    const rects = squarify([
      { key: "A", value: 6 },
      { key: "B", value: 3 },
      { key: "C", value: 1 },
    ]);
    expect(total(rects)).toBeCloseTo(10000, 6);
  });

  it("sizes each rectangle in proportion to its value", () => {
    const rects = squarify([
      { key: "A", value: 50 },
      { key: "B", value: 30 },
      { key: "C", value: 20 },
    ]);
    const area = (key: string) => {
      const rect = rects.find((r) => r.key === key)!;
      return (rect.width * rect.height) / 100;
    };
    expect(area("A")).toBeCloseTo(50, 4);
    expect(area("B")).toBeCloseTo(30, 4);
    expect(area("C")).toBeCloseTo(20, 4);
  });

  it("orders rectangles largest first", () => {
    const rects = squarify([
      { key: "small", value: 1 },
      { key: "big", value: 9 },
    ]);
    expect(rects[0].key).toBe("big");
  });

  it("keeps every rectangle inside the box", () => {
    const rects = squarify([
      { key: "A", value: 40 },
      { key: "B", value: 25 },
      { key: "C", value: 20 },
      { key: "D", value: 10 },
      { key: "E", value: 5 },
    ]);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.y).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.x + rect.width).toBeLessThanOrEqual(100 + 1e-9);
      expect(rect.y + rect.height).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it("drops negative values rather than inverting a rectangle", () => {
    const rects = squarify([
      { key: "A", value: 10 },
      { key: "B", value: -5 },
    ]);
    expect(rects.map((rect) => rect.key)).toEqual(["A"]);
  });

  it("insets rectangles to leave a gap between neighbours", () => {
    const [rect] = squarify([{ key: "A", value: 1 }], 2);
    expect(rect.width).toBeCloseTo(98, 6);
    expect(rect.x).toBeCloseTo(1, 6);
  });
});
