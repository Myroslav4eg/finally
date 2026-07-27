import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PortfolioHeatmap } from "@/components/PortfolioHeatmap";
import { EMPTY_PORTFOLIO, valuePortfolio } from "@/lib/portfolio";
import { makePortfolio, makePosition, makeUpdate } from "@/test/harness";

const twoPositions = makePortfolio({
  positions: [makePosition("AAPL", 10, 180), makePosition("NVDA", 1, 800)],
});

describe("PortfolioHeatmap", () => {
  it("renders a cell per position", () => {
    const portfolio = valuePortfolio(twoPositions, {
      AAPL: makeUpdate("AAPL", 200),
      NVDA: makeUpdate("NVDA", 700),
    });
    render(<PortfolioHeatmap portfolio={portfolio} />);

    expect(screen.getByTestId("heatmap-cell-AAPL")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-cell-NVDA")).toBeInTheDocument();
  });

  it("labels every cell with its signed P&L, so color is never the only channel", () => {
    const portfolio = valuePortfolio(twoPositions, {
      AAPL: makeUpdate("AAPL", 200),
      NVDA: makeUpdate("NVDA", 700),
    });
    render(<PortfolioHeatmap portfolio={portfolio} />);

    expect(screen.getByTestId("heatmap-cell-AAPL")).toHaveTextContent("+11.1%");
    expect(screen.getByTestId("heatmap-cell-NVDA")).toHaveTextContent("-12.5%");
  });

  it("sizes the larger holding to a larger rectangle", () => {
    const portfolio = valuePortfolio(twoPositions, {});
    render(<PortfolioHeatmap portfolio={portfolio} />);

    const area = (ticker: string) => {
      const cell = screen.getByTestId(`heatmap-cell-${ticker}`);
      return parseFloat(cell.style.width) * parseFloat(cell.style.height);
    };
    // AAPL is 1800 against NVDA's 800.
    expect(area("AAPL")).toBeGreaterThan(area("NVDA"));
  });

  it("carries the P&L on a data attribute for assertions", () => {
    const portfolio = valuePortfolio(twoPositions, { AAPL: makeUpdate("AAPL", 200) });
    render(<PortfolioHeatmap portfolio={portfolio} />);
    expect(screen.getByTestId("heatmap-cell-AAPL")).toHaveAttribute("data-pnl", "200.00");
  });

  it("reveals the position detail on hover", async () => {
    const portfolio = valuePortfolio(twoPositions, { AAPL: makeUpdate("AAPL", 200) });
    render(<PortfolioHeatmap portfolio={portfolio} />);

    await userEvent.hover(screen.getByTestId("heatmap-cell-AAPL"));
    expect(screen.getByTestId("heatmap-panel")).toHaveTextContent("$2,000.00");
  });

  it("explains itself when there is nothing to map", () => {
    render(<PortfolioHeatmap portfolio={EMPTY_PORTFOLIO} />);
    expect(screen.getByText(/No positions yet/)).toBeInTheDocument();
  });
});
