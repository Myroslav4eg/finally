# Test Report — Integration and E2E

Owner: Test Engineer. Last run: 2026-07-27, image `finally:test` rebuilt from the working tree
after the frontend fixes for DEFECT-1 and DEFECT-2.

**68 passed, 0 failed. No open defects.**

Both previously reported defects are verified fixed, and the rest of the suite is unchanged —
no regressions.

## Run history

| Run | Image | Result |
|---|---|---|
| 1 | pre-fix | 59 passed, 6 failed — 4 masked by DEFECT-1, 1 test-authoring error, 1 tooling limitation |
| 2 | pre-fix, suite corrected | 66 passed, 2 failed — one failure per real defect, cleanly isolated |
| 3 | post-fix | **68 passed, 0 failed** (32.7s), exit code 0 |
| 4 | post-fix, repeat on a fresh database | **68 passed, 0 failed** (38.4s), exit code 0 — stable |

## How to run

```bash
docker compose -f test/docker-compose.test.yml down -v --remove-orphans
docker compose -f test/docker-compose.test.yml up --build \
  --abort-on-container-exit --exit-code-from runner
docker compose -f test/docker-compose.test.yml down -v --remove-orphans
```

The first build pulls the ~800 MB Playwright image; later runs take about 40 seconds.

## Layout

| Path | What it holds |
|---|---|
| `test/docker-compose.test.yml` | Two app containers plus the Playwright runner |
| `test/Dockerfile` | Runner image (`mcr.microsoft.com/playwright:v1.61.1-noble`); browsers stay out of the production image |
| `test/playwright.config.ts` | Two projects: `api` and `e2e` |
| `test/api/*.spec.ts` | Cross-module integration: API + database + market data + LLM, no browser |
| `test/e2e/*.spec.ts` | Browser end-to-end |
| `test/helpers.ts` | Selectors, figure parsing, SSE frame reader |
| `test/proxy.ts` | Severable pass-through proxy used to drop a live stream |

Where the integration tests live and why: they sit in `test/api/` rather than `backend/tests/`.
They are black-box HTTP tests against a running container, so they exercise the wiring that no
single engineer owns — lifespan startup, lazy database seeding, the market data factory, the
service layer, and the mocked LLM turn — without duplicating anyone's unit tests. They also share
one toolchain and one command with the E2E suite.

## Isolation

- Each app container mounts **tmpfs at `/app/db`**, so the database is created, seeded and
  discarded per container. No run inherits the previous run's cash, positions or watchlist.
- The `api` and `e2e` projects each own a container (`app-api`, `app-e2e`), so the API suite's
  trades can never move the cash the browser suite asserts on.
- `workers: 1`, `fullyParallel: false`. Only `01-*` in each project asserts seeded state; every
  later spec reads its own baseline first and asserts deltas. No test depends on another having
  run.
- No absolute price is asserted anywhere. Prices are checked as relationships (moved, decreased,
  agrees in sign) with web-first assertions and explicit timeouts. There is no fixed `sleep` in the
  suite.

## Coverage against PLAN.md section 12

| Scenario | Spec | Result |
|---|---|---|
| Fresh start: 10 tickers, $10,000, prices streaming and changing | `e2e/01-fresh-start.spec.ts` | pass |
| Price flash, sparklines, chart, ticker selection | `e2e/01-fresh-start.spec.ts` | pass |
| Add and remove a watchlist ticker | `e2e/02-watchlist.spec.ts` | pass |
| Buy: cash down, position appears, totals hold | `e2e/03-trading.spec.ts` | pass |
| Sell: cash up, position updates or disappears | `e2e/03-trading.spec.ts` | pass |
| Heatmap renders, sized by value, coloured by P&L sign | `e2e/04-portfolio-visuals.spec.ts` | pass |
| P&L chart seeded from snapshots, has points | `e2e/04-portfolio-visuals.spec.ts` | pass |
| AI chat: message, response, executed trade inline | `e2e/05-chat.spec.ts` | pass |
| AI chat: watchlist change reaches the watchlist panel | `e2e/05-chat.spec.ts` | pass (was DEFECT-2) |
| AI chat on a plain-HTTP hostname origin | `e2e/05-chat.spec.ts` | pass (was DEFECT-1) |
| SSE resilience: drop, status changes, reconnects | `e2e/06-sse-resilience.spec.ts` | pass |
| Seeded state, health, static serving, JSON 404 | `api/01-seed.spec.ts` | pass |
| SSE frame shape, consistency, add/remove reaches the cache | `api/02-stream.spec.ts` | pass |
| Trade maths, weighted average cost, snapshots, all rejections | `api/03-trade.spec.ts` | pass |
| Watchlist normalization, idempotency, unpriced position valuation | `api/04-watchlist.spec.ts` | pass |
| Chat mock contract, failed action is still 200 | `api/05-chat.spec.ts` | pass |

## Closed defects

### DEFECT-1 — the whole app unmounted when a chat message was sent over plain HTTP

- **Owner: frontend-engineer. Status: fixed and verified.**
- Was: `ChatPanel.tsx` called `crypto.randomUUID()`, which is only defined in a secure context.
  On any HTTP origin other than `localhost` the submit handler threw
  `TypeError: crypto.randomUUID is not a function`, the error escaped the React event handler and
  React unmounted the tree — `workstation` element count went from 1 to 0.
- Fix: `src/lib/id.ts` exports `nextId(prefix)`, a module-local counter. All four call sites moved
  across.
- Verified: `grep -r crypto.randomUUID /app/static/` inside the rebuilt image returns **0 files**.
  `e2e/05-chat.spec.ts:128` loads the app by container hostname, asserts
  `window.isSecureContext === false`, sends a message, and now passes in 342 ms with the user turn
  rendered, the workstation still mounted, and zero `pageerror` events.

### DEFECT-2 — an AI watchlist change never reached the watchlist panel

- **Owner: frontend-engineer. Status: fixed and verified.**
- Was: `ChatPanel` called `onActions()`, which mapped to `Workstation.refreshAll`, which only
  awaited `usePortfolio().refresh()`. `useWatchlist` exposed no refresh, so nothing re-read
  `/api/watchlist`. Trade turns updated; watchlist turns did not.
- Fix: `useWatchlist` now returns `refresh`, and `refreshAll` awaits both refreshes together.
- Verified: `e2e/05-chat.spec.ts:88` sends `Add PYPL to my watchlist`, confirms the receipt, confirms
  the backend stored it, and now finds `watchlist-row-PYPL` in the panel without a reload. Passes in
  411 ms.

## Re-checked after the fix — the two items closed as non-defects

The `EventSource` stub added to `frontend/vitest.setup.ts` does not touch the shipped app. It is
registered through vitest `setupFiles`, which Next never loads, and it is guarded by
`if (!globalThis.EventSource)`. Confirmed against the rebuilt image: `/app/static/` contains zero
occurrences of `vitest`, `jest-dom` or the stub's `ResizeObserver = class`, and the real
`new EventSource("/api/stream/prices")` is still in the bundle. Both items re-verified
behaviourally:

- **Stream outage handling is unchanged.** All four `06-sse-resilience` specs pass. With a genuine
  socket sever the status moves to `connecting`, the last known prices stay on screen rather than
  reverting to em dashes, EventSource retries on the server's `retry: 1000`, and the status returns
  to `live` with ticks resuming — 2.8 s end to end.
- **The trade ticker still falls back to the selection.** `03-trading.spec.ts:118` still passes:
  clearing `trade-ticker` re-fills it from the current selection and Buy stays enabled. This remains
  intended behaviour, not a bug.

Kept for the record: `BrowserContext.setOffline` cannot test a dropped stream. Chromium's offline
emulation refuses new requests but leaves an established streaming response flowing — the status
stayed `live` across 63 samples in 30 s. That is why `test/proxy.ts` exists.

## Contract observations for future test authors

- Backend response shapes come from `backend/app/schemas.py` and `FRONTEND_TESTIDS.md`, not
  PLAN.md section 8. All verified against the running container.
- A failed LLM action is HTTP 200 with `status: "failed"` and an `error` string. Confirmed for
  `Buy 100000 AAPL`, which returns `Insufficient cash: ...` and leaves cash untouched.
- `DELETE /api/watchlist/{ticker}` returns 404 for a ticker that is not watched, not 204.
- Removing a watched ticker drops it from the price cache within one tick; a position in that
  ticker then reports `current_price: null` and is carried at `avg_cost`.
- The watchlist "Session" column is change since the first price seen this page load. The stream
  carries no daily open.
- Origin matters for browser APIs. `127.0.0.1` and `localhost` are secure contexts; a container
  hostname or LAN IP over HTTP is not. Any new use of a secure-context-only API needs a test on a
  hostname origin, which is what `05-chat.spec.ts:128` now guards.
