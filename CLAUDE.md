# Tower Finance — project guide

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/HANDOFF.md](docs/HANDOFF.md) · [docs/SESSION_SUMMARY.md](docs/SESSION_SUMMARY.md) ·
[docs/UPGRADING.md](docs/UPGRADING.md)

## Project overview

Self-hosted single-user personal finance PWA built to replace a spreadsheet.
Its distinctive feature is **pay-cycle budgeting**: budget periods run payday →
day-before-next-payday instead of calendar months, while reporting/trends stay
calendar-based. Manual entry only (no bank sync), one Docker container, one
SQLite file, optional password protection. Open source (MIT) at
`github.com/Blacksuite/tower-finance`; CI publishes `ghcr.io/blacksuite/tower-finance`.
Designed for trusted networks (LAN/VPN/own reverse proxy). EUR/nl-NL number
formatting by default (configurable); dates always use English month names.

## Architecture — the rules that matter

- **`src/shared/calc.ts` is the single source of all derived numbers**
  (summaries, budget vs actual, plan cascade, net worth). Never compute
  financial values in components. It is pure and fully unit-tested.
- **Salary cycles** (`src/shared/cycles.ts`): a cycle is keyed `YYYY-MM` by
  **the month its salary lands in** and displayed as a date range via
  `fmtCycle()` ("26 Jun – 25 Jul 2026"). With salaryDay 1 (default) cycles are
  exactly calendar months. Most calc functions accept an optional
  `bucket?: CycleSettings`; pass `CALENDAR` for calendar-month reporting
  (dashboard trend charts do this), omit it for cycle-based budgeting.
- **Virtual expenses**: payment-plan installments (`planSchedule` cascade —
  overrides ripple forward, final installment self-caps) and subscription
  occurrences (`src/shared/recurring.ts`) are computed, never stored as
  transactions. They flow into expenses/budgets automatically.
- **Data flow**: the API (`src/server/app.ts`, zod-validated CRUD) serves raw
  rows; the client loads everything once via `GET /api/bootstrap` into a
  single TanStack Query cache entry. All mutations in `src/client/api/data.ts`
  are optimistic against that entry with rollback + toast.
- **Auth**: optional password, scrypt hash in DB settings row `auth_hash`
  (never bootstrapped/exported; import preserves it). Sessions are random
  tokens in an **httpOnly cookie** (`tower_session`); only their SHA-256 lives
  in the `sessions` table. Login/auth endpoints are rate limited; password
  change/disable revokes all sessions; `/api/logout` = lock. Nothing
  auth-related is stored in localStorage. The service worker never caches
  `/api` responses.

## Coding conventions

- TypeScript strict everywhere; `noUnusedLocals/Parameters` on.
- Hand-rolled CSS design tokens in `src/client/theme/` (no Tailwind). Calm
  neutral surfaces, semantic color only on numbers/marks; hairline borders, no
  shadows; 4px grid; amounts always tabular numerals heavier than labels.
- Formatters (`src/shared/format.ts`) are module-level; number/currency locale
  comes from settings via `configureFormat()`, dates are always en-GB English.
  Tests rely on EUR/nl-NL number defaults.
- Keep files under ~500 lines; screens in `src/client/screens/`, reusable
  pieces in `src/client/components/`, all domain logic in `src/shared/`.
- Navigation: mobile = top bar (brand, lock, settings gear) + tab bar
  (Dashboard, Months, FAB, Plans, History) + Plans⇄Subscriptions switcher;
  desktop = sidebar with all sections. The top bar owns the iOS safe-area.

## Important rules & constraints (hard-won)

- **Every `<button>` inside a `<form>` needs an explicit `type`** — an
  untyped button submits the form (this caused real data corruption once).
- `.tx-row__secondary` is nowrap+ellipsis for list rows; use `.hint` for
  helper text that must wrap.
- Grids with nowrap content need `minmax(0, 1fr)` columns; `.main` needs
  `width: 100%` (grid item with auto margins shrinks to content otherwise).
- No NaN ever: every division is guarded; money rounds via `round2`/EPS.
- Never add runtime caching for `/api` to the service worker (privacy).
- `data/` is gitignored runtime state. Never commit it; wipe demo data after
  browser testing (`rm -rf data`).
- ALWAYS run `npm test` and `npm run build` before committing.

## Common commands

```bash
npm run dev:server   # API on :3210 (tsx watch)
npm run dev          # Vite client on :5173, proxies /api
npm test             # vitest — domain + API + auth tests in tests/
npm run lint         # tsc typecheck (client + server configs)
npm run build        # icons → vite build → esbuild server (dist/)
npm start            # serve production build on :3210
docker compose up -d --build
```

For UI checks use the preview tooling (`.claude/launch.json` →
`tower-finance`, port 3210, production build — run `npm run build` first).
Seed via the API, review at 390px and 1440px, and run an overflow detector
(elements with `getBoundingClientRect().right > clientWidth`) on all routes.

## Key dependencies

| Package | Role |
|---|---|
| `hono` + `@hono/node-server` | HTTP server, routing, cookies, static files |
| `better-sqlite3` | synchronous SQLite (WAL) — perfect for single user |
| `zod` | API input validation at the boundary |
| `react` 18 + `react-router-dom` 6 | UI + 6 routes |
| `@tanstack/react-query` 5 | single bootstrap cache + optimistic mutations |
| `recharts` | dashboard trend charts (restyled via theme tokens) |
| `framer-motion` | sheet spring, list transitions, swipe-to-delete |
| `vite` + `vite-plugin-pwa` | build + app-shell-only service worker |
| `@fontsource/inter`, `@fontsource/space-grotesk` | self-hosted fonts (no CDN) |
| `esbuild` (script) | bundles the server to `dist/server` |

## Deployment

See `docs/UPGRADING.md` (backup → update → verify, restore, rollback). GitHub
Actions builds `ghcr.io` images on push to main/tags; on the server either
`docker compose pull && up -d` (registry mode) or `git pull && docker compose
up -d --build` (source mode), or `scripts/update.sh` which backs up the DB
first. Version comes from package.json (shown in Settings footer + sidebar) —
bump it and tag releases `vX.Y.Z`.
