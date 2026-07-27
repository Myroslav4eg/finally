import { describe, expect, it } from "vitest";
import { nextId } from "@/lib/id";

describe("nextId", () => {
  it("never repeats an id", () => {
    const ids = new Set(Array.from({ length: 500 }, () => nextId("x")));
    expect(ids.size).toBe(500);
  });

  it("keeps the caller's prefix so keys are readable", () => {
    expect(nextId("user")).toMatch(/^user-\d+$/);
    expect(nextId("assistant")).toMatch(/^assistant-\d+$/);
  });

  it("does not repeat across prefixes either", () => {
    const first = nextId("a");
    const second = nextId("b");
    expect(first.split("-")[1]).not.toBe(second.split("-")[1]);
  });

  it("works with no crypto global at all", () => {
    const original = globalThis.crypto;
    // @ts-expect-error - deleting a global to model a non-secure context
    delete globalThis.crypto;
    try {
      expect(nextId("safe")).toMatch(/^safe-\d+$/);
    } finally {
      globalThis.crypto = original;
    }
  });
});
