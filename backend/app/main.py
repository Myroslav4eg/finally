"""FinAlly FastAPI application: wiring, lifespan, and static file serving."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import chat, health, portfolio, watchlist
from app.db import initialize_database
from app.db.repositories import watchlist as watchlist_repo
from app.llm import LLMClient, LLMError, create_client
from app.market import PriceCache, create_market_data_source, create_stream_router
from app.services import ServiceError, run_snapshot_loop
from app.state import MarketContext

logger = logging.getLogger(__name__)

STATIC_DIR_ENV = "FINALLY_STATIC_DIR"
API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


def static_dir() -> Path:
    """Directory holding the exported Next.js frontend."""
    configured = os.environ.get(STATIC_DIR_ENV)
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the database, start market data and the snapshot task."""
    await asyncio.to_thread(initialize_database)

    market: MarketContext = app.state.market
    tickers = await asyncio.to_thread(watchlist_repo.list_tickers)
    await market.source.start(tickers)
    snapshot_task = asyncio.create_task(run_snapshot_loop(market), name="portfolio-snapshots")
    logger.info("FinAlly started with %d tickers", len(tickers))

    yield

    snapshot_task.cancel()
    await asyncio.gather(snapshot_task, return_exceptions=True)
    await market.source.stop()
    logger.info("FinAlly stopped")


async def service_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Turn a failed business validation into a 400 with a readable message."""
    return JSONResponse(status_code=400, content={"detail": str(exc)})


async def llm_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Turn an unusable model response or a failed model call into a 502."""
    logger.warning("LLM call failed: %s", exc)
    return JSONResponse(status_code=502, content={"detail": str(exc)})


def create_app(
    market: MarketContext | None = None,
    llm_client: LLMClient | None = None,
) -> FastAPI:
    """Build the application. Pass `market` and `llm_client` to inject them (tests)."""
    if market is None:
        cache = PriceCache()
        market = MarketContext(cache=cache, source=create_market_data_source(cache))

    app = FastAPI(title="FinAlly", version="0.1.0", lifespan=lifespan)
    app.state.market = market
    app.state.llm_client = llm_client or create_client()
    app.add_exception_handler(ServiceError, service_error_handler)
    app.add_exception_handler(LLMError, llm_error_handler)

    app.include_router(health.router)
    app.include_router(portfolio.router)
    app.include_router(watchlist.router)
    app.include_router(chat.router)
    app.include_router(create_stream_router(market.cache))

    @app.api_route("/api/{path:path}", methods=API_METHODS, include_in_schema=False)
    async def api_not_found(path: str) -> None:
        """Keep unmatched /api/* requests from falling through to static files."""
        raise HTTPException(status_code=404, detail=f"No such API endpoint: /api/{path}")

    directory = static_dir()
    if directory.is_dir():
        app.mount("/", StaticFiles(directory=directory, html=True), name="static")
    else:
        logger.warning("Static directory %s not found; serving API only", directory)

    return app


app = create_app()
