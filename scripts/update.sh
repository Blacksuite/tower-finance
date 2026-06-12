#!/usr/bin/env bash
# Safe one-command update: backup the database, pull the new version,
# rebuild/restart, and show what is running. Works in source mode (git) and,
# with IMAGE set in docker-compose.yml, in registry mode (compose pull).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Backing up database"
mkdir -p backups
if [ -f data/tower.db ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 data/tower.db ".backup backups/tower-$(date +%F-%H%M%S).db"
  else
    cp data/tower.db "backups/tower-$(date +%F-%H%M%S).db"
  fi
  ls -t backups | head -1
else
  echo "    no database yet — skipping"
fi

echo "==> Pulling latest version"
if [ -d .git ]; then
  git pull --ff-only
else
  echo "    not a git checkout — relying on compose pull"
fi

echo "==> Rebuilding and restarting"
docker compose pull --ignore-buildable 2>/dev/null || true
docker compose up -d --build

echo "==> Done. Running version:"
node -p "require('./package.json').version" 2>/dev/null || true
docker compose ps tower-finance
