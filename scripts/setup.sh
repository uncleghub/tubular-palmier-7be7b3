#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export npm_config_cache="${npm_config_cache:-/tmp/graham-npm-cache}"
npm ci --no-audit --no-fund
if [ ! -f .env.local ]; then cp .env.example .env.local; fi
if docker container inspect graham-postgres >/dev/null 2>&1; then
  docker start graham-postgres >/dev/null
else
  docker run -d --name graham-postgres --restart unless-stopped -e POSTGRES_USER=studio -e POSTGRES_PASSWORD=local-development-only -e POSTGRES_DB=studio -p 127.0.0.1:5432:5432 -v graham-postgres-data:/var/lib/postgresql/data postgres:17-alpine >/dev/null
fi
for attempt in $(seq 1 30); do
  if docker exec graham-postgres pg_isready -U studio -d studio >/dev/null; then break; fi
  if [ "$attempt" = 30 ]; then echo 'PostgreSQL readiness failed' >&2; exit 1; fi
  sleep 1
done
npm run db:migrate
ffmpeg -version >/dev/null
ffprobe -version >/dev/null
npm run typecheck
npm run test
npm run build
