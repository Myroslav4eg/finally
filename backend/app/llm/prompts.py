"""System prompt and message construction for the chat assistant."""

from __future__ import annotations

from app.db.models import ChatMessage
from app.schemas import Portfolio, WatchlistResponse

HISTORY_LIMIT = 20

SYSTEM_PROMPT = """You are FinAlly, an AI trading assistant embedded in a simulated \
trading workstation. The user trades a virtual portfolio with fake money.

Your job:
- Analyze portfolio composition, concentration risk, and unrealized P&L.
- Suggest trades and always give the reasoning behind them.
- Execute trades when the user asks for them or agrees to a suggestion.
- Manage the watchlist proactively when a ticker becomes relevant to the conversation.
- Be concise and data-driven. Reference the actual numbers in the portfolio context.

Rules:
- Only market orders are supported. There are no limit orders, fees, or short sales.
- Put every trade you intend to execute in the `trades` array; do not claim in `message` \
that you executed something you left out of the array.
- Put every watchlist change in the `watchlist_changes` array, with action "add" or "remove".
- Leave both arrays empty when the user only wants analysis or conversation.
- A ticker must be on the watchlist to have a live price. Add it before trading it.
"""


def format_portfolio_context(portfolio: Portfolio, watchlist: WatchlistResponse) -> str:
    """Render the live portfolio and watchlist as compact text for the prompt."""
    lines = [
        "CURRENT PORTFOLIO",
        f"Cash: ${portfolio.cash_balance:,.2f}",
        f"Positions value: ${portfolio.positions_value:,.2f}",
        f"Total value: ${portfolio.total_value:,.2f}",
        f"Unrealized P&L: ${portfolio.unrealized_pnl:,.2f} "
        f"({portfolio.unrealized_pnl_percent:+.2f}%)",
        "",
        "POSITIONS",
    ]
    if portfolio.positions:
        lines.append("ticker | qty | avg cost | price | market value | P&L | weight")
        for position in portfolio.positions:
            price = f"${position.current_price:,.2f}" if position.current_price else "n/a"
            lines.append(
                f"{position.ticker} | {position.quantity:g} | ${position.avg_cost:,.2f} | "
                f"{price} | ${position.market_value:,.2f} | "
                f"${position.unrealized_pnl:,.2f} ({position.unrealized_pnl_percent:+.2f}%) | "
                f"{position.weight:.1f}%"
            )
    else:
        lines.append("No open positions.")

    lines += ["", "WATCHLIST"]
    if watchlist.items:
        for item in watchlist.items:
            price = f"${item.price:,.2f}" if item.price else "no price yet"
            change = f" ({item.change_percent:+.2f}%)" if item.change_percent is not None else ""
            lines.append(f"{item.ticker}: {price}{change}")
    else:
        lines.append("Watchlist is empty.")

    return "\n".join(lines)


def history_to_messages(history: list[ChatMessage]) -> list[dict[str, str]]:
    """Convert stored chat rows into LiteLLM message dicts, oldest first."""
    return [{"role": message.role, "content": message.content} for message in history]


def build_messages(
    portfolio: Portfolio,
    watchlist: WatchlistResponse,
    history: list[ChatMessage],
    message: str,
) -> list[dict[str, str]]:
    """Assemble system prompt, live context, prior turns, and the new user message."""
    context = format_portfolio_context(portfolio, watchlist)
    return [
        {"role": "system", "content": f"{SYSTEM_PROMPT}\n{context}"},
        *history_to_messages(history),
        {"role": "user", "content": message},
    ]
