"""Shared runtime handles for the live market data subsystem."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request

from app.market import MarketDataSource, PriceCache


@dataclass(frozen=True, slots=True)
class MarketContext:
    """The price cache and the active data source, shared by routes and services."""

    cache: PriceCache
    source: MarketDataSource


def get_market(request: Request) -> MarketContext:
    """FastAPI dependency yielding the application's MarketContext."""
    return request.app.state.market
