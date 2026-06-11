# Tower Finance

Self-hosted personal finance PWA: manual transaction entry, monthly budgets,
payment plans with auto-scheduling, and a cash-flow dashboard. Single user,
LAN only, no authentication. EUR / nl-NL formatting.

## Run on Unraid (or any Docker host)

```bash
docker compose up -d --build
```

Open `http://<server-ip>:3210`. On a phone, use "Add to Home Screen" — the app
installs as a fullscreen PWA and opens instantly offline.

- The image builds locally; no registry or env vars needed.
- Port mapping is `3210:3210` (change the left side in `docker-compose.yml` if needed).
- Reverse-proxy the single HTTP port however you like.

## Where the data lives

All data is a single SQLite database at **`./data/tower.db`** (mounted into the
container at `/app/data`). It survives container rebuilds and updates.

## Backups

Two options:

1. **File copy** — stop the container (or just copy live; WAL mode keeps it
   consistent enough for a personal setup): `cp data/tower.db backups/`.
   For a guaranteed-consistent copy while running:
   `sqlite3 data/tower.db ".backup backups/tower-$(date +%F).db"`.
2. **In-app JSON export** — Settings → Backup → *Export JSON* downloads the
   entire database as one JSON file; *Import JSON* restores it (replaces all data).

## Development

```bash
npm install
npm run dev:server   # API on :3210 (SQLite in ./data)
npm run dev          # Vite dev server on :5173, proxies /api
npm test             # unit tests for the calculation engine + API
npm run build        # production build (client + server + PWA icons)
npm start            # serve the production build on :3210
```

Stack: React + Vite + TypeScript, Hono + better-sqlite3, Recharts,
framer-motion, vite-plugin-pwa. All domain math (monthly summaries, budget vs
actual, the payment-plan cascade, net worth) lives in `src/shared/calc.ts`
with tests in `tests/`.
