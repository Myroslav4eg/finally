#!/usr/bin/env bash
# Start FinAlly in Docker. Idempotent: safe to run repeatedly.
# Usage: ./scripts/start_mac.sh [--build] [--no-open]
set -euo pipefail

IMAGE=finally
CONTAINER=finally
VOLUME=finally-data
PORT=8000

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUILD=false
OPEN=true
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=true ;;
    --no-open) OPEN=false ;;
    *) echo "Unknown option: $arg"; echo "Usage: $0 [--build] [--no-open]"; exit 1 ;;
  esac
done

if [ ! -f .env ]; then
  echo "No .env found; creating one from .env.example."
  cp .env.example .env
  echo "Edit .env to add your OPENROUTER_API_KEY before using the AI chat."
fi

if [ "$BUILD" = true ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE image..."
  docker build -t "$IMAGE" .
fi

docker volume create "$VOLUME" >/dev/null

if [ -n "$(docker ps -aq -f name="^${CONTAINER}$")" ]; then
  echo "Removing existing $CONTAINER container (the $VOLUME volume is kept)."
  docker rm -f "$CONTAINER" >/dev/null
fi

docker run -d --name "$CONTAINER" \
  -p "${PORT}:8000" \
  -v "${VOLUME}:/app/db" \
  --env-file .env \
  "$IMAGE" >/dev/null

URL="http://localhost:${PORT}"
echo "Waiting for FinAlly to become healthy..."
for _ in $(seq 1 60); do
  if curl -fs "${URL}/api/health" >/dev/null 2>&1; then
    echo "FinAlly is running at ${URL}"
    if [ "$OPEN" = true ] && command -v open >/dev/null; then
      open "$URL"
    fi
    exit 0
  fi
  sleep 1
done

echo "FinAlly did not become healthy within 60 seconds. Recent logs:"
docker logs --tail 40 "$CONTAINER"
exit 1
