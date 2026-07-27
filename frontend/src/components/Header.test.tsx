import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";
import { valuePortfolio } from "@/lib/portfolio";
import { makePortfolio, makeUpdate } from "@/test/harness";
import type { ConnectionState } from "@/lib/types";

const portfolio = valuePortfolio(makePortfolio(), { AAPL: makeUpdate("AAPL", 200) });

function renderHeader(status: ConnectionState = "live", onToggleChat = vi.fn()) {
  render(
    <Header portfolio={portfolio} status={status} chatOpen onToggleChat={onToggleChat} />,
  );
}

describe("Header", () => {
  it("shows total value, unrealized P&L and cash", () => {
    renderHeader();
    expect(screen.getByTestId("header-total-value")).toHaveTextContent("$7,000.00");
    expect(screen.getByTestId("header-pnl")).toHaveTextContent("+$200.00");
    expect(screen.getByTestId("header-cash")).toHaveTextContent("$5,000.00");
  });

  it("labels every connection state, not just its color", () => {
    renderHeader("live");
    expect(screen.getByTestId("connection-status")).toHaveTextContent("Live");
    expect(screen.getByTestId("connection-status")).toHaveAttribute("data-status", "live");
  });

  it("reports reconnecting and offline states", () => {
    const { unmount } = render(
      <Header portfolio={portfolio} status="connecting" chatOpen onToggleChat={vi.fn()} />,
    );
    expect(screen.getByTestId("connection-status")).toHaveTextContent("Reconnecting");
    unmount();

    render(
      <Header portfolio={portfolio} status="offline" chatOpen onToggleChat={vi.fn()} />,
    );
    expect(screen.getByTestId("connection-status")).toHaveTextContent("Offline");
  });

  it("toggles the assistant panel", async () => {
    const onToggleChat = vi.fn();
    renderHeader("live", onToggleChat);
    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(onToggleChat).toHaveBeenCalled();
  });
});
