#!/usr/bin/env bash
# Stop FinAlly. Idempotent: safe to run repeatedly. Never removes the data volume.
set -euo pipefail

CONTAINER=finally

if [ -n "$(docker ps -aq -f name="^${CONTAINER}$")" ]; then
  docker rm -f "$CONTAINER" >/dev/null
  echo "Stopped and removed the $CONTAINER container. The finally-data volume is kept."
else
  echo "No $CONTAINER container found; nothing to do."
fi
