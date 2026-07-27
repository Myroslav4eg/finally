# Stage 1: build the Next.js static export.
FROM node:20-slim AS frontend

WORKDIR /build

# Dependencies first so source edits do not invalidate the install layer.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# Stage 2: FastAPI runtime serving the API and the exported frontend.
FROM python:3.12-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_CACHE=1 \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    FINALLY_DB_PATH=/app/db/finally.db \
    FINALLY_STATIC_DIR=/app/static

WORKDIR /app

# Runtime dependencies only (dev extras are not installed by uv sync).
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-install-project

COPY backend/app/ ./app/
RUN uv sync --frozen

COPY --from=frontend /build/out/ ./static/

RUN mkdir -p /app/db
VOLUME ["/app/db"]

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
