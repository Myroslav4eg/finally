import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PositionsTable } from "@/components/PositionsTable";
import { EMPTY_PORTFOLIO, valuePortfolio } from "@/lib/portfolio";
import { makePortfolio, makeUpdate } from "@/test/harness";

describe("PositionsTable", () => {
  it("renders a row per position with live P&L", () => {
    const portfolio = valuePortfolio(makePortfolio(), { AAPL: makeUpdate("AAPL", 200) });
    render(<PositionsTable portfolio={portfolio} onSelect={vi.fn()} />);

    const row = screen.getByTestId("position-row-AAPL");
    expect(row).toHaveTextContent("10");
    expect(row).toHaveTextContent("$180.00");
    expect(screen.getByTestId("position-price-AAPL")).toHaveTextContent("200.00");
    expect(screen.getByTestId("position-pnl-AAPL")).toHaveTextContent("+$200.00");
    expect(row).toHaveTextContent("+11.11%");
  });

  it("tones a losing position down and pairs it with a glyph", () => {
    const portfolio = valuePortfolio(makePortfolio(), { AAPL: makeUpdate("AAPL", 150) });
    render(<PositionsTable portfolio={portfolio} onSelect={vi.fn()} />);

    const pnl = screen.getByTestId("position-pnl-AAPL");
    expect(pnl).toHaveTextContent("-$300.00");
    expect(pnl.className).toContain("text-down");
    expect(screen.getByTestId("position-row-AAPL")).toHaveTextContent("▼");
  });

  it("invites a first trade when there are no positions", () => {
    render(<PositionsTable portfolio={EMPTY_PORTFOLIO} onSelect={vi.fn()} />);
    expect(screen.getByTestId("positions-count")).toHaveTextContent("0 open");
    expect(screen.getByText(/No open positions/)).toBeInTheDocument();
  });

  it("selects the ticker when a row is clicked", async () => {
    const onSelect = vi.fn();
    render(<PositionsTable portfolio={valuePortfolio(makePortfolio(), {})} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId("position-row-AAPL"));
    expect(onSelect).toHaveBeenCalledWith("AAPL");
  });
});
