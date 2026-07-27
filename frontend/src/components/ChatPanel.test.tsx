import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/ChatPanel";
import { sendChatMessage } from "@/lib/api";

vi.mock("@/lib/api", () => ({ sendChatMessage: vi.fn() }));

const mocked = vi.mocked(sendChatMessage);
const NOW = "2026-01-01T00:00:00Z";

describe("ChatPanel", () => {
  it("opens with an assistant greeting", () => {
    render(<ChatPanel onActions={vi.fn()} />);
    expect(screen.getByTestId("chat-messages")).toHaveTextContent("I am FinAlly");
  });

  it("shows the user message, a loading indicator, then the reply", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof sendChatMessage>>) => void;
    mocked.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<ChatPanel onActions={vi.fn().mockResolvedValue(undefined)} />);
    await userEvent.type(screen.getByTestId("chat-input"), "how am I doing?");
    await userEvent.click(screen.getByTestId("chat-send"));

    expect(screen.getByTestId("chat-message-user")).toHaveTextContent("how am I doing?");
    expect(screen.getByTestId("chat-loading")).toBeInTheDocument();

    resolve({
      message: "You are up 2%.",
      actions: { trades: [], watchlist_changes: [] },
      created_at: NOW,
    });

    await waitFor(() =>
      expect(screen.queryByTestId("chat-loading")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("chat-message-assistant").at(-1)).toHaveTextContent(
      "You are up 2%.",
    );
  });

  it("renders an executed trade inline and refreshes the portfolio", async () => {
    const onActions = vi.fn().mockResolvedValue(undefined);
    mocked.mockResolvedValue({
      message: "Bought 5 AAPL.",
      actions: {
        trades: [{ ticker: "AAPL", side: "buy", quantity: 5, status: "executed", price: 190 }],
        watchlist_changes: [],
      },
      created_at: NOW,
    });

    render(<ChatPanel onActions={onActions} />);
    await userEvent.type(screen.getByTestId("chat-input"), "buy 5 aapl");
    await userEvent.click(screen.getByTestId("chat-send"));

    const receipt = await screen.findByTestId("chat-trade-AAPL");
    expect(receipt).toHaveTextContent("BUY");
    expect(receipt).toHaveTextContent("5 AAPL");
    expect(receipt).toHaveTextContent("at 190.00");
    expect(onActions).toHaveBeenCalled();
  });

  it("shows a rejected trade as a failure, not a fill", async () => {
    mocked.mockResolvedValue({
      message: "That order did not go through.",
      actions: {
        trades: [
          {
            ticker: "TSLA",
            side: "buy",
            quantity: 500,
            status: "failed",
            error: "Not enough cash",
          },
        ],
        watchlist_changes: [],
      },
      created_at: NOW,
    });

    render(<ChatPanel onActions={vi.fn().mockResolvedValue(undefined)} />);
    await userEvent.type(screen.getByTestId("chat-input"), "buy 500 tsla");
    await userEvent.click(screen.getByTestId("chat-send"));

    const receipt = await screen.findByTestId("chat-trade-TSLA");
    expect(receipt).toHaveTextContent("Not enough cash");
    expect(receipt.className).toContain("border-down/50");
  });

  it("renders watchlist changes made by the assistant", async () => {
    mocked.mockResolvedValue({
      message: "Added PYPL.",
      actions: {
        trades: [],
        watchlist_changes: [{ ticker: "PYPL", action: "add", status: "executed" }],
      },
      created_at: NOW,
    });

    render(<ChatPanel onActions={vi.fn().mockResolvedValue(undefined)} />);
    await userEvent.type(screen.getByTestId("chat-input"), "watch pypl");
    await userEvent.click(screen.getByTestId("chat-send"));

    expect(await screen.findByTestId("chat-watchlist-PYPL")).toHaveTextContent("add PYPL");
  });

  it("reports an unreachable assistant instead of failing silently", async () => {
    mocked.mockRejectedValue(new Error("Request failed (503)"));

    render(<ChatPanel onActions={vi.fn()} />);
    await userEvent.type(screen.getByTestId("chat-input"), "hello");
    await userEvent.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByTestId("chat-messages")).toHaveTextContent("Request failed (503)"),
    );
  });

  it("ignores an empty submission", async () => {
    const before = mocked.mock.calls.length;
    render(<ChatPanel onActions={vi.fn()} />);
    await userEvent.click(screen.getByTestId("chat-send"));
    expect(mocked.mock.calls.length).toBe(before);
  });
});

/**
 * Regression for DEFECT-1. crypto.randomUUID is only defined in a secure
 * context, so on any plain-HTTP origin other than localhost it is undefined.
 * A throw here escaped the React handler and unmounted the whole app.
 */
describe("ChatPanel outside a secure context", () => {
  function withoutRandomUUID(run: () => Promise<void>) {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { ...original, randomUUID: undefined },
    });
    return run().finally(() => {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: original,
      });
    });
  }

  it("sends a message and renders both turns with no randomUUID available", async () => {
    await withoutRandomUUID(async () => {
      expect(globalThis.crypto.randomUUID).toBeUndefined();
      mocked.mockResolvedValue({
        message: "You are up 2%.",
        actions: { trades: [], watchlist_changes: [] },
        created_at: NOW,
      });

      render(<ChatPanel onActions={vi.fn().mockResolvedValue(undefined)} />);
      await userEvent.type(screen.getByTestId("chat-input"), "How is my portfolio");
      await userEvent.click(screen.getByTestId("chat-send"));

      expect(screen.getByTestId("chat-message-user")).toHaveTextContent(
        "How is my portfolio",
      );
      await waitFor(() =>
        expect(screen.getAllByTestId("chat-message-assistant").at(-1)).toHaveTextContent(
          "You are up 2%.",
        ),
      );
      // The panel is still mounted - the defect took the whole tree down.
      expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    });
  });

  it("keeps distinct React keys for every turn without randomUUID", async () => {
    await withoutRandomUUID(async () => {
      mocked.mockResolvedValue({
        message: "Noted.",
        actions: { trades: [], watchlist_changes: [] },
        created_at: NOW,
      });
      render(<ChatPanel onActions={vi.fn().mockResolvedValue(undefined)} />);

      for (const text of ["first", "second", "third"]) {
        await userEvent.type(screen.getByTestId("chat-input"), text);
        await userEvent.click(screen.getByTestId("chat-send"));
        await waitFor(() =>
          expect(screen.queryByTestId("chat-loading")).not.toBeInTheDocument(),
        );
      }

      expect(screen.getAllByTestId("chat-message-user")).toHaveLength(3);
      expect(screen.getAllByTestId("chat-message-assistant")).toHaveLength(4);
    });
  });
});
