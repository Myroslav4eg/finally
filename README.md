# FinAlly — AI Trading Workstation

A visually stunning AI-powered trading workstation that streams market data, simulates portfolio trading, and integrates an LLM chat assistant that can analyze positions and execute trades via natural language.

**Out of the box everything is simulated.** Prices are generated locally and the portfolio is play money. See [Market Data](#market-data) to connect a real quote feed.

Built entirely by coding agents as a capstone project for an agentic AI coding course.

## Features

- **Live price streaming** via SSE with green/red flash animations
- **Simulated portfolio** — $10k virtual cash, market orders, instant fills
- **Portfolio visualizations** — heatmap (treemap), P&L chart, positions table
- **AI chat assistant** — analyzes holdings, suggests and auto-executes trades
- **Watchlist management** — track tickers manually or via AI
- **Dark terminal aesthetic** — Bloomberg-inspired, data-dense layout

## Architecture

Single Docker container serving everything on port 8000:

- **Frontend**: Next.js (static export) with TypeScript and Tailwind CSS
- **Backend**: FastAPI (Python/uv) with SSE streaming
- **Database**: SQLite with lazy initialization
- **AI**: LiteLLM → OpenRouter (Cerebras inference) with structured outputs
- **Market data**: Built-in GBM simulator (default) or Massive API (optional)

## Quick Start

Requires Docker.

```bash
cp .env.example .env      # then add your OPENROUTER_API_KEY

./scripts/start_mac.sh    # builds the image if needed, starts on http://localhost:8000
./scripts/stop_mac.sh     # stops the container; your data volume is kept
```

Windows PowerShell: `.\scripts\start_windows.ps1` and `.\scripts\stop_windows.ps1`.

Both start scripts accept `--build` / `-Build` to force a rebuild and `--no-open` / `-NoOpen`
to skip opening the browser. All four are idempotent.

Equivalent manual commands:

```bash
docker build -t finally .
docker run -d --name finally -v finally-data:/app/db -p 8000:8000 --env-file .env finally
```

Or with Compose: `docker compose up -d --build` / `docker compose down`.

The SQLite database lives on the `finally-data` volume and survives restarts. To start over,
stop the app and run `docker volume rm finally-data`.

## Market Data

### Simulated by default

With no `MASSIVE_API_KEY` set, the app runs entirely on generated data. Nothing
leaves your machine and no quote provider is contacted.

- Ticker symbols and starting prices are real (AAPL near $190, NVDA near $800),
  but every move after that is invented by a geometric Brownian motion model
  with per-ticker drift and volatility.
- Tech names move together and finance names move together, via a correlation
  matrix, so the screen behaves like a market rather than ten random walks.
- Roughly one tick in a thousand fires a 2-5% jump, for drama.
- Prices update every 500ms and keep moving at 3am on a Sunday.

The portfolio is play money too: $10,000 of virtual cash, instant fills at the
current simulated price, no fees and no counterparty. Nothing here places a real
order or touches a real account.

This is the recommended mode. It needs no key, costs nothing, and demonstrates
the whole application.

### Connecting real quotes

Real market data comes from [Polygon.io](https://polygon.io) through the
`massive` client, which is already a dependency. Both sources implement the same
interface, so the price cache, SSE stream, portfolio valuation and frontend are
unchanged — only the source of the numbers differs.

```bash
# 1. Get a key at https://polygon.io (free tier works)
# 2. Add it to .env in the project root
MASSIVE_API_KEY=your-key-here

# 3. Restart
./scripts/stop_mac.sh && ./scripts/start_mac.sh

# 4. Confirm the switch took effect
curl -s localhost:8000/api/health
# {"status":"ok","market_source":"MassiveDataSource",...}
```

`market_source` still reporting `SimulatorDataSource` means the key never
reached the container — check that `.env` is in the project root and non-empty.

### What changes on the free tier

Expect the app to feel different, and to look broken when it is not:

| | Simulator | Polygon free tier |
|---|---|---|
| Update frequency | every 500ms | one poll every 15s for all tickers |
| Data freshness | instant | delayed 15 minutes |
| Outside market hours | keeps moving | frozen, no updates at all |
| New watchlist ticker | priced immediately | priced on the next poll, up to 15s |

Flashes become occasional instead of constant, and sparklines take minutes to
fill. Real-time quotes and faster polling require a paid Polygon tier; the poll
interval is set in `MassiveDataSource(poll_interval=...)`.

Other providers (Finnhub, Alpha Vantage, Twelve Data) can be added as a new
class implementing `MarketDataSource` plus a branch in
`backend/app/market/factory.py`. Nothing downstream needs to change.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for AI chat |
| `MASSIVE_API_KEY` | No | Massive (Polygon.io) key for real market data; omit to use simulator |
| `LLM_MOCK` | No | Set `true` for deterministic mock LLM responses (testing) |

## Project Structure

```
finally/
├── frontend/    # Next.js static export
├── backend/     # FastAPI uv project
├── planning/    # Project documentation and agent contracts
├── test/        # Playwright E2E tests
├── db/          # SQLite volume mount (runtime)
└── scripts/     # Start/stop helpers
```

## License

See [LICENSE](LICENSE).
