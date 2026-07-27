# FinAlly Project - the Finance Ally

All project documentation is in the `planning` directory.

The key document is PLAN.md, included in full below. The platform is built:
database, API, LLM chat, frontend, container and test suites are all in place
and passing. Where PLAN.md and the code disagree, the code is authoritative and
PLAN.md is the thing to correct.

Each area publishes a contract document. Consult only the one covering the area
you are working on.

| Document | Covers |
|---|---|
| `planning/DATABASE.md` | data-access interface for `backend/app/db/` |
| `planning/BACKEND_SERVICES.md` | service functions shared by the API and the chat assistant |
| `planning/LLM_MOCK.md` | deterministic responses under `LLM_MOCK=true` |
| `planning/FRONTEND_TESTIDS.md` | selector contract the E2E suite depends on |
| `planning/TEST_REPORT.md` | suite status and closed defects |
| `planning/MARKET_DATA_SUMMARY.md` | market data subsystem, with detail in `planning/archive/` |

Agent role definitions, including ownership boundaries, are in `.claude/agents/`.

@planning/PLAN.md
