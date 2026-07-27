# Backend Services — Interface Contract

The business logic lives in `backend/app/services/`. The REST routes are thin wrappers over these
functions, so anything that calls them — including the chat endpoint — gets identical validation.

**Do not re-implement trade or watchlist logic.** Import these functions.

## Quick Start

```python
from app.services import ServiceError, execute_trade, add_ticker, remove_ticker, get_portfolio
from app.state import MarketContext, get_market

@router.post("/api/chat")
async def chat(request: ChatRequest, market: Annotated[MarketContext, Depends(get_market)]):
    portfolio = await get_portfolio(market)          # context for the prompt
    try:
        result = await execute_trade(market, "AAPL", "buy", 10)
    except ServiceError as exc:
        error = str(exc)                             # report back to the LLM / user
```

## MarketContext

`app.state.MarketContext` is a frozen dataclass holding `cache: PriceCache` and
`source: MarketDataSource`. One instance lives at `app.state.market` for the process lifetime.
Get it in a route with `Depends(get_market)`; the async service functions all take it as their
first argument.

## Errors

Every business-rule failure raises `app.services.ServiceError` with a user-readable message.
`main.py` registers a handler mapping it to **HTTP 400** with `{"detail": "<message>"}`.
Nothing else is raised for expected failures — there are no sentinel return values.

## Trading — `app.services.trading`

```python
async def execute_trade(market, ticker: str, side: str, quantity: float,
                        user_id: str = "default") -> TradeExecution
def execute_trade_sync(cache, ticker, side, quantity, user_id="default") -> TradeExecution
```

Fills a market order instantly at the latest cached price. The async form is the one to use from
request handlers; it just runs the sync form in a thread.

Validation, in order — each raises `ServiceError`:

| Check | Message |
|---|---|
| Symbol is `[A-Z][A-Z0-9.-]{0,9}` after strip/upper | `Invalid ticker symbol: ...` |
| `side` in `{"buy", "sell"}` | `Invalid side: ...` |
| `quantity > 0` | `Quantity must be greater than zero` |
| Ticker has a cached price | `No price available for X` |
| Buy: `quantity * price <= cash` | `Insufficient cash: ...` |
| Sell: `quantity <= shares held` | `Insufficient shares: ...` |

On success, one transaction writes: the cash adjustment, the position row (weighted-average cost
on buys, unchanged `avg_cost` on sells, row deleted on a full sell), the trade log entry, and a
`portfolio_snapshots` row. A rejected trade writes nothing.

Fractional quantities are supported. Tickers are normalized, so `"aapl"` works.

## Portfolio — `app.services.portfolio`

```python
async def get_portfolio(market, user_id="default") -> Portfolio
async def get_history(limit: int | None = None, user_id="default") -> PortfolioHistory
def build_portfolio(cache, user_id="default", conn=None) -> Portfolio   # sync, transaction-aware
def build_history(limit=None, user_id="default", conn=None) -> PortfolioHistory
def record_snapshot(cache, user_id="default", conn=None) -> float       # returns total value
```

`Portfolio` carries `cash_balance`, `positions`, `positions_value`, `total_value`,
`unrealized_pnl`, `unrealized_pnl_percent` — everything the LLM needs for portfolio context.
A position whose ticker has no cached price is valued at its `avg_cost` and reports
`current_price: null`. `weight` is the position's share of `positions_value` as a percentage.

## Watchlist — `app.services.watchlist`

```python
async def get_watchlist(market, user_id="default") -> WatchlistResponse
async def add_ticker(market, ticker: str, user_id="default") -> WatchlistItem
async def remove_ticker(market, ticker: str, user_id="default") -> bool
```

`add_ticker` is idempotent and also calls `source.add_ticker`, so the ticker starts streaming
immediately and becomes tradable. `remove_ticker` returns `False` when the ticker was not watched;
on success it calls `source.remove_ticker`, which drops it from the price cache too. Both raise
`ServiceError` for an invalid symbol.

## Snapshots — `app.services.snapshots`

```python
SNAPSHOT_INTERVAL = 30.0
async def run_snapshot_loop(market, interval=SNAPSHOT_INTERVAL, user_id="default") -> None
```

Started by the app lifespan and cancelled on shutdown. Trades snapshot themselves, so nothing else
needs to call this.

## Models — `app.schemas`

Pydantic models used both as service return types and as route `response_model`s:
`Portfolio`, `PositionValue`, `TradeRequest`, `TradeRecord`, `TradeExecution`, `PortfolioHistory`,
`SnapshotPoint`, `WatchlistResponse`, `WatchlistItem`, `WatchlistAddRequest`, `HealthResponse`,
and the `Side = Literal["buy", "sell"]` alias.

## Adding a Route

Register the router in `create_app` **before** the static mount, with an `/api/...` prefix.
`/api/*` is guarded by a catch-all that returns a JSON 404, so unmatched API paths never reach the
static files.

## Environment

| Variable | Purpose |
|---|---|
| `FINALLY_DB_PATH` | SQLite file location (see `planning/DATABASE.md`) |
| `FINALLY_STATIC_DIR` | Next.js export directory; defaults to `backend/static`, skipped if absent |
| `MASSIVE_API_KEY` | Selects the real market data source over the simulator |
