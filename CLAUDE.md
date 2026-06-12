# Tower Finance — project guide

Self-hosted single-user personal finance PWA (React + Vite + TS client, Hono +
better-sqlite3 server, one Docker container, SQLite in `./data/tower.db`).
Deployed on the owner's Unraid server "The-Tower", LAN-only behind their own
reverse proxy. EUR/nl-NL defaults; currency/locale configurable in Settings.

## Commands

```bash
npm run dev:server   # API on :3210 (tsx watch)
npm run dev          # Vite client on :5173, proxies /api
npm test             # vitest — domain + API tests in tests/
npm run lint         # tsc typecheck (client + server configs)
npm run build        # icons → vite build → esbuild server (dist/)
npm start            # serve production build on :3210
docker compose up -d --build
```

ALWAYS run `npm test` and `npm run build` before committing.

## Architecture — the rules that matter

- **`src/shared/calc.ts` is the single source of all derived numbers**
  (summaries, budget vs actual, plan cascade, net worth). Never compute
  financial values in components. It is pure and fully unit-tested.
- **Salary cycles** (`src/shared/cycles.ts`): budget periods run payday →
  day-before-next-payday (settings: `salaryDay`, `weekendRule`). A cycle is
  keyed `YYYY-MM` by **the month its salary lands in** and displayed as a date
  range via `fmtCycle()` ("26 jun – 25 jul 2026"). With salaryDay 1 (default)
  cycles are exactly calendar months. Most calc functions accept an optional
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
- **Auth**: optional password, scrypt hash stored in DB settings row
  `auth_hash` (never bootstrapped/exported; import preserves it). The session
  token IS the stored hash, sent as `x-tower-key`. Managed entirely in
  Settings → Security; no env vars.

## Conventions & gotchas

- Hand-rolled CSS design tokens in `src/client/theme/` (no Tailwind). Calm
  neutral surfaces, semantic color only on numbers/marks; hairline borders, no
  shadows; 4px grid; amounts always tabular numerals heavier than labels.
- **Every `<button>` inside a `<form>` needs an explicit `type`** — an
  untyped button submits the form (this caused real data corruption once).
- `.tx-row__secondary` is nowrap+ellipsis for list rows; use `.hint` for
  helper text that must wrap.
- Grids with nowrap content need `minmax(0, 1fr)` columns; `.main` needs
  `width: 100%` (grid item with auto margins).
- Formatters (`src/shared/format.ts`) are module-level and configured from
  settings via `configureFormat()` at load; tests rely on EUR/nl-NL defaults.
- No NaN ever: every division is guarded; money rounds via `round2`/EPS.
- Keep files under ~500 lines; screens in `src/client/screens/`, reusable
  pieces in `src/client/components/`.
- `data/` is gitignored runtime state. Never commit it; wipe demo data after
  browser testing (`rm -rf data`).

## Testing & verification

- Unit tests cover the calc contract (cascade incl. overrides/capping, budget
  sign conventions: expense diff = budget−actual, savings/investments
  inverted; active-cycle YTD; cycle keying; subscriptions; net worth with
  plan liabilities) plus API/auth lifecycle. Add tests when touching calc.
- For UI checks use the preview tooling (`.claude/launch.json` →
  `tower-finance`, port 3210, production build — run `npm run build` first).
  Seed via the API, review at 390px and 1440px, and run an overflow detector
  (elements with `getBoundingClientRect().right > clientWidth`) on all routes.

## Deployment

See `docs/UPGRADING.md` (backup → update → verify, restore, rollback). GitHub
Actions builds `ghcr.io` images on push to main/tags; on the server either
`docker compose pull && up -d` (registry mode) or `git pull && docker compose
up -d --build` (source mode), or `scripts/update.sh` which backs up the DB
first. Version comes from package.json (shown in Settings footer) — bump it
and tag releases `vX.Y.Z`.
