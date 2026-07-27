# LLM Mock Mode — Trigger Contract

With `LLM_MOCK=true` the backend never calls OpenRouter. `POST /api/chat` runs the real endpoint,
the real service layer, and the real database — only the model call is replaced by a deterministic
keyword matcher. Trades and watchlist changes still go through the same validation as manual ones,
so a mocked buy really moves cash.

Source of truth: `backend/app/llm/mock.py`. Tests: `backend/tests/llm/test_mock.py`.

## Enabling

```bash
LLM_MOCK=true          # exactly this, case-insensitive; anything else means real mode
```

Set in `.env`, `docker-compose.test.yml`, or the container environment.

## How a message is matched

Only the **latest user message** is inspected. Two values are extracted from it first:

| Value | Rule | Fallback |
|---|---|---|
| Ticker | first all-caps word of 2-5 letters (`\b[A-Z]{2,5}\b`) | `AAPL` |
| Quantity | first number, integer or decimal (`\d+(\.\d+)?`) | `1` |

Then the first matching rule below wins. Matching is case-insensitive.

| # | Trigger | Result |
|---|---|---|
| 1 | contains `sell` | a **sell** trade of the extracted ticker and quantity |
| 2 | contains `buy` | a **buy** trade of the extracted ticker and quantity |
| 3 | contains `watchlist` or `watch`, plus `remove` or `drop` | a watchlist **remove** of the extracted ticker |
| 4 | contains `watchlist` or `watch` | a watchlist **add** of the extracted ticker |
| 5 | anything else | plain analysis, both action arrays empty |

Rules 1-2 are checked before 3-4, so "Buy 3 TSLA and add it to my watchlist" produces only a trade.

## Exact responses

| Scenario | `message` |
|---|---|
| Analysis | `Mock analysis: your portfolio looks balanced and no action is needed right now.` |
| Buy | `Mock trade: submitting a buy for {qty} {TICKER} at the market price.` |
| Sell | `Mock trade: submitting a sell for {qty} {TICKER} at the market price.` |
| Watchlist add | `Mock watchlist: adding {TICKER} to your watchlist.` |
| Watchlist remove | `Mock watchlist: removing {TICKER} from your watchlist.` |

`{qty}` is formatted with `%g`: `3`, not `3.0`; `0.25` stays `0.25`.

## Recommended E2E prompts

| Prompt | What to assert |
|---|---|
| `How is my portfolio doing?` | 200, message starts `Mock analysis:`, `actions.trades` and `actions.watchlist_changes` both `[]` |
| `Buy 3 AAPL` | `actions.trades[0]` is `AAPL`/`buy`/`3`/`executed` with a numeric `price`; cash drops by `3 * price` |
| `Add PYPL to my watchlist` | `actions.watchlist_changes[0]` is `PYPL`/`add`/`executed`; `GET /api/watchlist` now contains PYPL |
| `Sell 1 AAPL` | after the buy above, `status: "executed"`; cash rises |
| `Buy 100000 AAPL` | 200 (not an error), `status: "failed"`, `error` starts `Insufficient cash` |

## Response shape

```json
{
  "message": "Mock trade: submitting a buy for 3 AAPL at the market price.",
  "actions": {
    "trades": [
      {"ticker": "AAPL", "side": "buy", "quantity": 3.0,
       "status": "executed", "price": 190.12, "error": null}
    ],
    "watchlist_changes": []
  },
  "created_at": "2026-07-26T14:03:11.482913+00:00"
}
```

`status` is `"executed"` or `"failed"`. A failed action is still HTTP 200 — the failure is
reported in `error` so the user learns why. Watchlist outcomes carry `ticker`, `action`,
`status`, `error` and no `price`.

## Notes for test authors

- Watchlist changes are applied **before** trades in a turn, so a ticker added on the same turn is
  tradable immediately.
- Both turns are persisted to `chat_messages`; the assistant row carries the actions JSON, or
  `null` when nothing was executed.
- Prices come from the simulator, so assert on relationships (cash decreased, position exists),
  not on absolute prices.
- Only a genuine model failure returns a non-200: HTTP 502 with `{"detail": ...}`. That cannot
  happen in mock mode.
- A ticker must have a cached price to be traded. Trading a ticker outside the default watchlist
  needs a watchlist add first, and one simulator tick before the price exists.
