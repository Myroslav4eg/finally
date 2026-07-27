"""Portfolio and trading endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas import Portfolio, PortfolioHistory, TradeExecution, TradeRequest
from app.services import portfolio as portfolio_service
from app.services import trading
from app.state import MarketContext, get_market

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

Market = Annotated[MarketContext, Depends(get_market)]


@router.get("", response_model=Portfolio)
async def get_portfolio(market: Market) -> Portfolio:
    """Positions valued at live prices, cash balance, total value, unrealized P&L."""
    return await portfolio_service.get_portfolio(market)


@router.post("/trade", response_model=TradeExecution)
async def trade(request: TradeRequest, market: Market) -> TradeExecution:
    """Execute a market order, filled instantly at the latest cached price."""
    return await trading.execute_trade(
        market, request.ticker, request.side, request.quantity
    )


@router.get("/history", response_model=PortfolioHistory)
async def history(
    limit: Annotated[int | None, Query(gt=0, le=5000)] = None,
) -> PortfolioHistory:
    """Portfolio value snapshots for the P&L chart, oldest first."""
    return await portfolio_service.get_history(limit)
