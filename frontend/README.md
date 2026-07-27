# FinAlly frontend

Next.js (App Router) + TypeScript + Tailwind, built as a static export and
served by FastAPI on the same origin. All calls are relative `/api/...` paths,
so there is no CORS configuration.

## Commands

```bash
npm install
npm run dev     # http://localhost:3000 against the in-memory mock backend
npm run lint
npm test
npm run build   # static export to out/
```

`npm run dev` sets `NEXT_PUBLIC_MOCK_API=1`, which routes the API client and
the price stream to `src/lib/mock/backend.ts` so the UI runs without the real
backend. Production builds never set it and the mock is not bundled.

## Structure

```
src/
  app/          layout, page, design tokens in globals.css
  components/   one file per panel, plus shared Panel chrome
  hooks/        usePrices (the single SSE source), usePortfolio, useWatchlist, useFlash
  lib/          api client, wire types, formatting, portfolio valuation, treemap layout
  lib/mock/     dev-only in-memory backend
  test/         shared test harness
```

## Conventions

- Every network call goes through `src/lib/api.ts`. No `fetch` in components.
- One `EventSource` for the whole app, in `PriceStreamProvider`. Panels read it
  through `usePriceStream()`.
- Charts use Lightweight Charts and are fed with `series.update()`, so a 500ms
  tick never rebuilds a canvas.
- `data-testid` attributes are a contract with the E2E suite. They are
  documented in `planning/FRONTEND_TESTIDS.md`; do not rename them casually.
