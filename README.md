# Tower Finance

Self-hosted personal finance PWA: manual transaction entry, salary-cycle
budgeting (periods run from payday to payday, with weekend handling),
subscriptions and recurring expense templates, payment plans with
auto-scheduling, net worth tracking with asset/liability breakdown, transaction
history filters, and a cash-flow dashboard. Single user, designed for LAN use.
Optional password protection (managed in Settings, no env vars). Currency and
locale are configurable (defaults: EUR / nl-NL).

Upgrading an existing install? See [docs/UPGRADING.md](docs/UPGRADING.md).

## Quick start — prebuilt image (recommended)

No cloning or building needed. Create a `docker-compose.yml`:

```yaml
services:
  tower-finance:
    image: ghcr.io/blacksuite/tower-finance:latest
    container_name: tower-finance
    ports:
      - "3210:3210"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

```bash
docker compose up -d          # first deploy
docker compose pull && docker compose up -d   # every update
```

Pin a version tag (e.g. `:1.1.0`) instead of `latest` if you prefer explicit
upgrades — rolling back is pointing at the previous tag. Tools like Watchtower
or Unraid's built-in container update check work out of the box.

## Run from source (build locally)

```bash
git clone https://github.com/Blacksuite/tower-finance && cd tower-finance
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

## License

[MIT](LICENSE) — free and open source.
