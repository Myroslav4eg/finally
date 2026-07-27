import { ConnectionDot } from "@/components/ConnectionDot";
import { arrow, signedPercent, signedUsd, toneClass, usd } from "@/lib/format";
import type { LivePortfolio } from "@/lib/portfolio";
import type { ConnectionState } from "@/lib/types";

interface HeaderProps {
  portfolio: LivePortfolio;
  status: ConnectionState;
  chatOpen: boolean;
  onToggleChat: () => void;
}

/** Top rail: the wordmark, the three figures that always matter, stream state. */
export function Header({ portfolio, status, chatOpen, onToggleChat }: HeaderProps) {
  const { unrealizedPnl, unrealizedPnlPercent } = portfolio;

  return (
    <header className="flex h-12 shrink-0 items-stretch border-b border-line bg-panel">
      <div className="flex items-center gap-2.5 border-r border-line px-4">
        <span className="h-4 w-1 bg-yellow" aria-hidden="true" />
        <span className="font-cond text-[15px] font-semibold tracking-[0.22em] text-ink">
          FINALLY
        </span>
      </div>

      <Figure label="Total value" testId="header-total-value">
        <span className="text-ink">{usd(portfolio.totalValue)}</span>
      </Figure>

      <Figure label="Unrealized P&L" testId="header-pnl">
        <span className={toneClass(unrealizedPnl)}>
          <span aria-hidden="true">{arrow(unrealizedPnl)} </span>
          {signedUsd(unrealizedPnl)}
          <span className="ml-2 text-[11px] opacity-80">
            {signedPercent(unrealizedPnlPercent)}
          </span>
        </span>
      </Figure>

      <Figure label="Cash" testId="header-cash">
        <span className="text-ink-2">{usd(portfolio.cash)}</span>
      </Figure>

      <div className="flex flex-1 items-center justify-end gap-4 px-4">
        <ConnectionDot status={status} />
        <button
          type="button"
          onClick={onToggleChat}
          data-testid="chat-toggle"
          aria-expanded={chatOpen}
          className="border border-line-hi px-2.5 py-1 font-cond text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-2 hover:border-blue hover:text-ink"
        >
          {chatOpen ? "Hide assistant" : "Show assistant"}
        </button>
      </div>
    </header>
  );
}

function Figure({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-center gap-0.5 border-r border-line px-4">
      <span className="eyebrow">{label}</span>
      <span data-testid={testId} className="text-[15px] leading-none font-medium">
        {children}
      </span>
    </div>
  );
}
