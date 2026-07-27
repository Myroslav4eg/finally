# Backend — Developer Guide

## Project Setup

```bash
cd backend
uv sync --extra dev   # Install all dependencies including test/lint tools
```

## Market Data API

The market data subsystem lives in `app/market/`. Use these imports:

```python
from app.market import PriceCache, PriceUpdate, MarketDataSource, create_market_data_source
```

### Core Types

- **`PriceUpdate`** — Immutable dataclass: `ticker`, `price`, `previous_price`, `timestamp`, plus properties `change`, `change_percent`, `direction` ("up"/"down"/"flat"), and `to_dict()` for JSON serialization.

- **`PriceCache`** — Thread-safe in-memory store. Key methods:
  - `update(ticker, price, timestamp=None) -> PriceUpdate`
  - `get(ticker) -> PriceUpdate | None`
  - `get_price(ticker) -> float | None`
  - `get_all() -> dict[str, PriceUpdate]`
  - `remove(ticker)`
  - `version` property — monotonic counter, increments on every update (for SSE change detection)

- **`MarketDataSource`** — Abstract interface implemented by `SimulatorDataSource` and `MassiveDataSource`. Lifecycle: `start(tickers)` -> `add_ticker()` / `remove_ticker()` -> `stop()`.

- **`create_market_data_source(cache)`** — Factory. Returns `MassiveDataSource` if `MASSIVE_API_KEY` is set, otherwise `SimulatorDataSource`.

### SSE Streaming

```python
from app.market import create_stream_router

router = create_stream_router(price_cache)  # Returns FastAPI APIRouter
# Endpoint: GET /api/stream/prices (text/event-stream)
```

### Seed Data

Default tickers: AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX. Seed prices and per-ticker volatility/drift params are in `app/market/seed_prices.py`.

## Database API

The SQLite layer lives in `app/db/`. No other module writes SQL. Full contract: `planning/DATABASE.md`.

```python
from app.db import initialize_database, transaction
from app.db.repositories import chat, positions, profile, snapshots, trades, watchlist
```

### Core Types

Frozen dataclasses with `to_dict()`: `UserProfile`, `WatchlistEntry`, `Position` (+`cost_basis`),
`Trade` (+`notional`), `PortfolioSnapshot`, `ChatMessage`.

### Repositories

- **`profile`** — `get_profile()`, `get_cash_balance()`, `set_cash_balance(balance)`, `adjust_cash_balance(delta)`
- **`watchlist`** — `list_watchlist()`, `list_tickers()`, `get_entry(t)`, `has_ticker(t)`, `add_ticker(t)` (idempotent), `remove_ticker(t) -> bool`
- **`positions`** — `list_positions()`, `get_position(t)`, `upsert_position(t, quantity, avg_cost)` (absolute values), `delete_position(t) -> bool`
- **`trades`** — `record_trade(t, side, quantity, price)`, `list_trades(ticker=None, limit=None)` (newest first)
- **`snapshots`** — `record_snapshot(total_value)`, `list_snapshots(since=None, limit=None)` (oldest first), `latest_snapshot()`
- **`chat`** — `add_message(role, content, actions=None)`, `list_messages(limit=None)` (oldest first), `clear_messages()`

Every function takes trailing `user_id="default"` and `conn=None` arguments.

### Rules

- **Sync functions.** Call them from FastAPI handlers via `asyncio.to_thread(...)`.
- **Lazy init.** `initialize_database()` at startup is idempotent; the first repository call also
  initializes automatically. Seeds cash 10000.0 and the 10 default tickers.
- **Transactions.** `with transaction() as conn:` then pass `conn=conn` to each call — commits on
  exit, rolls back on exception. Use it for trade execution (cash + position + trade log).
- **No business validation.** Overdrafts and short positions are the portfolio service's problem.
- **Path.** `FINALLY_DB_PATH` env var, default `<project root>/db/finally.db`. Docker sets it to
  `/app/db/finally.db`.

## Application

`app/main.py` builds the FastAPI app. `uv run uvicorn app.main:app --port 8000`.

- **Lifespan** — initializes the database, starts the market data source with the watchlist
  tickers, runs the 30-second snapshot task, stops both on shutdown.
- **Routes** — `app/api/{health,portfolio,watchlist,chat}.py` plus the mounted SSE router. All API
  routers are registered before the static mount, and a `/api/{path:path}` catch-all returns a JSON
  404 so `/api/*` never falls through to static files.
- **Static** — serves the Next.js export from `FINALLY_STATIC_DIR` (default `backend/static`).
  Skipped with a warning when the directory is absent.
- **Services** — `app/services/` holds trade execution, portfolio valuation, and watchlist
  mutation as plain functions. Reuse them instead of duplicating validation. Full contract:
  `planning/BACKEND_SERVICES.md`.
- **Errors** — services raise `ServiceError`; the app maps it to HTTP 400. The LLM layer raises
  `LLMError`, mapped to HTTP 502.
- **Env** — `.env` at the project root is loaded on import (`load_dotenv`); real environment
  variables always win.

## AI Chat

`app/llm/` owns `POST /api/chat`. LiteLLM calls `openrouter/openai/gpt-oss-120b` with Cerebras as
the provider and `AssistantResponse` as the structured output schema.

```python
from app.llm import ChatResponse, create_client, run_chat
```

- **Flow** — `run_chat` loads portfolio, watchlist, and the last 20 chat rows, builds the prompt,
  calls the model, runs the proposed actions through `app/services/`, then persists both turns.
- **Failed actions are not errors.** Each outcome carries `status` (`executed`/`failed`) and an
  `error` string; the response is still HTTP 200. Only a model failure returns 502, and it
  persists nothing.
- **Client** — `create_app` stores one client on `app.state.llm_client`; pass one to `create_app`
  to inject a stub in tests. `LLM_MOCK=true` selects the deterministic offline client documented
  in `planning/LLM_MOCK.md`.

## Running Tests

```bash
uv run --extra dev pytest -v              # All tests
uv run --extra dev pytest --cov=app       # With coverage
uv run --extra dev ruff check app/ tests/ # Lint
```

## Demo

```bash
uv run market_data_demo.py   # Live terminal dashboard with simulated prices
```
