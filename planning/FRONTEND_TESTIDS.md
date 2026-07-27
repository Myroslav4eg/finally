# Frontend test IDs

The stable `data-testid` contract for the FinAlly UI. These are owned by the
Frontend Engineer and will not change without updating this file. E2E tests
should select on these rather than on text, class names, or DOM position.

Names containing `{TICKER}` are interpolated with the uppercase symbol, e.g.
`watchlist-row-AAPL`.

## Shell

| Test ID | Element | Notes |
|---|---|---|
| `workstation` | Root container | Present once the app has mounted |
| `header-total-value` | Total portfolio value | Live; cash plus positions at streamed prices |
| `header-pnl` | Unrealized P&L | Signed dollars plus percent, with a direction glyph |
| `header-cash` | Cash balance | From the last `/api/portfolio` read |
| `connection-status` | Stream status wrapper | Carries `data-status="live" \| "connecting" \| "offline"` and a visible label |
| `connection-dot` | The colored dot itself | Color only; assert on `connection-status` instead |
| `chat-toggle` | Show/hide assistant button | `aria-expanded` reflects the panel state |

## Watchlist

| Test ID | Element | Notes |
|---|---|---|
| `watchlist-panel` | Panel wrapper | |
| `watchlist-count` | "N symbols" | |
| `watchlist-rows` | Scrolling row container | Row count = children |
| `watchlist-row-{TICKER}` | One row | `data-ticker`, `data-selected="true" \| "false"`; click selects |
| `watchlist-price-{TICKER}` | Last price cell | Two decimals, or an em dash before the first tick. Gains a `flash-up` / `flash-down` class for ~500ms on a price change |
| `watchlist-change-{TICKER}` | Session change | Signed percent plus ▲/▼/– glyph |
| `watchlist-remove-{TICKER}` | Remove button | Revealed on row hover/focus; does not select the row |
| `watchlist-add-input` | Add-symbol field | Uppercases as you type |
| `watchlist-add-button` | Add submit | |
| `watchlist-error` | Error line | Only rendered when an add/remove failed |

Note: "session change" is measured against the first price observed since page
load, not a daily open. The stream carries no daily open.

## Main chart

| Test ID | Element | Notes |
|---|---|---|
| `main-chart-panel` | Panel wrapper | Title is `{TICKER} · session` |
| `main-chart` | Canvas container | Lightweight Charts renders here; no DOM to assert inside |
| `main-chart-readout` | Price and change readout | Follows the crosshair on hover, otherwise shows the last price |

## Portfolio heatmap

| Test ID | Element | Notes |
|---|---|---|
| `heatmap-panel` | Panel wrapper | Header shows a diverging legend, or the hovered position's detail |
| `heatmap` | Treemap container | Empty-state text when there are no positions |
| `heatmap-cell-{TICKER}` | One rectangle | `data-pnl` is the unrealized P&L to two decimals. Inline `style.width` / `style.height` are percentages; area is proportional to market value. Each cell labels its ticker and signed P&L percent |

## P&L chart

| Test ID | Element | Notes |
|---|---|---|
| `pnl-panel` | Panel wrapper | |
| `pnl-chart` | Canvas container | Seeded from `/api/portfolio/history` |
| `pnl-readout` | Value and percent change | Follows the crosshair on hover |

## Positions table

| Test ID | Element | Notes |
|---|---|---|
| `positions-panel` | Panel wrapper | |
| `positions-count` | "N open" | |
| `position-row-{TICKER}` | One row | `data-ticker`; click selects the ticker in the chart and trade bar |
| `position-price-{TICKER}` | Current price cell | Flashes on change, same classes as the watchlist |
| `position-pnl-{TICKER}` | Unrealized P&L | Signed dollars |

Rows are sorted by market value, largest first.

## Trade bar

| Test ID | Element | Notes |
|---|---|---|
| `trade-bar` | Wrapper | |
| `trade-ticker` | Ticker input | Prefilled from the current selection; uppercases as you type |
| `trade-quantity` | Quantity input | Defaults to `10` |
| `trade-estimate` | Estimated notional | `≈ $1,900.00`, or an em dash when the ticker is unpriced |
| `trade-buy` | Buy button | Disabled without a ticker or a positive quantity |
| `trade-sell` | Sell button | Same disabled rule |
| `trade-notice` | Result line | `data-tone="ok" \| "error"`; the error text is the backend's `detail` |

Market orders only. No confirmation dialog: the click places the order.

## Chat panel

| Test ID | Element | Notes |
|---|---|---|
| `chat-panel` | Sidebar | Absent from the DOM when collapsed via `chat-toggle` |
| `chat-messages` | Scrolling history | |
| `chat-message-user` | A user turn | Multiple; use `getAllByTestId(...).at(-1)` for the latest |
| `chat-message-assistant` | An assistant turn | Multiple; the opening greeting is one of these |
| `chat-loading` | Thinking indicator | Present only while a request is in flight |
| `chat-input` | Message field | |
| `chat-send` | Send button | Empty input is ignored |
| `chat-trade-{TICKER}` | Inline trade receipt | `data-status="executed" \| "failed"` |
| `chat-watchlist-{TICKER}` | Inline watchlist receipt | `data-status="executed" \| "failed"` |

## Price flash classes

A price cell gets `flash-up` or `flash-down` for ~500ms when its price moves,
then the class is removed. The first price observed does not flash. Both
classes animate the background from a tint to transparent, so a screenshot
taken mid-animation may show any intermediate color; assert on the class.

## Backend contract this UI assumes

Taken from `backend/app/schemas.py` and `backend/app/llm/schemas.py`.

| Endpoint | Response |
|---|---|
| `GET /api/stream/prices` | SSE; each `data:` frame is `{TICKER: PriceUpdate}` for every tracked ticker |
| `GET /api/portfolio` | `Portfolio` |
| `POST /api/portfolio/trade` | `TradeExecution` (`{trade, position, cash_balance, total_value}`) |
| `GET /api/portfolio/history` | `{snapshots: SnapshotPoint[]}` |
| `GET /api/watchlist` | `{items: WatchlistItem[]}` |
| `POST /api/watchlist` | `WatchlistItem`, 201 |
| `DELETE /api/watchlist/{ticker}` | 204 |
| `POST /api/chat` | `{message, actions: {trades, watchlist_changes}, created_at}` |

Errors are read from FastAPI's `{"detail": "..."}` and shown verbatim in
`trade-notice` or `watchlist-error`.
