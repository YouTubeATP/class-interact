#!/bin/sh
set -e
# Apply database migrations (idempotent), then start the server.
node /app/server/scripts/prisma.mjs migrate deploy
exec node /app/server/dist/index.js
