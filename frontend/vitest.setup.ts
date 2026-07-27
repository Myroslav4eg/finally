import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(cleanup);

// jsdom has no layout engine; charts measure their container.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom implements neither scroll method.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = vi.fn();
}

// jsdom has no EventSource. An inert stub lets the full app mount; tests that
// care about prices supply them through PriceStreamContext instead.
if (!globalThis.EventSource) {
  globalThis.EventSource = class {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    close() {
      this.readyState = 2;
    }
  } as unknown as typeof EventSource;
}
