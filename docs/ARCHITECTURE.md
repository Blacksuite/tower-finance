# Architecture

## Folder structure

```
├── Dockerfile, docker-compose.yml      # single container; SQLite volume ./data
├── .github/workflows/release.yml       # tests + GHCR image on main/v* tags
├── scripts/                            # generate-icons.mjs, build-server.mjs, update.sh
├── tests/                              # vitest: calc, cycles, plans, format, api, auth
└── src/
    ├── shared/        # pure domain layer, used by client AND server
    │   ├── calc.ts        # ALL derived numbers (the contract — never bypass)
    │   ├── cycles.ts      # salary-cycle engine (salaryDate, cycleKeyOf, cycleBounds, CALENDAR)
    │   ├── recurring.ts   # subscription billing occurrences
    │   ├── format.ts      # currency (settings locale) + dates (always en-GB)
    │   ├── types.ts       # domain types + DEFAULT_SETTINGS
    │   └── constants.ts   # type labels/signs
    ├── server/
    │   ├── db.ts          # schema (CREATE IF NOT EXISTS = auto-migration), row mapping,
    │   │                  # settings, auth hash, sessions, replaceAll (import)
    │   ├── app.ts         # Hono app: auth middleware, rate limiting, zod-validated CRUD
    │   └── index.ts       # boot: DB at $DATA_DIR/tower.db, serve dist/client, port 3210
    └── client/
        ├── main.tsx, App.tsx          # providers, routes, PasswordGate, ScrollToTop
        ├── api/data.ts                # bootstrap query + ALL optimistic mutations
        ├── theme/                     # tokens.css (design tokens), base/layout/components/
        │                              # overlays.css, theme.ts (dark/light + chart colors)
        ├── components/                # Layout (nav), Ribbon, QuickAdd, TransactionList,
        │                              # BudgetBars, PlanCard, charts.tsx, UpdateBanner, ui/*
        └── screens/                   # Dashboard, MonthView, Plans, Subscriptions,
                                       # History, Settings
```

## Data flow

1. Client calls `GET /api/bootstrap` once → the **entire dataset** (raw rows:
   transactions, categories, settings, plans, planPayments, subscriptions,
   templates, `auth.enabled`) lands in **one** TanStack Query cache entry
   (key `['bootstrap']`).
2. Screens derive everything via `src/shared/calc.ts` in `useMemo` — the
   server never computes aggregates.
3. Mutations (in `api/data.ts`) are optimistic: patch the bootstrap cache,
   fire the request, roll back + toast on failure, invalidate on settle.
4. **Virtual expenses**: plan installments and subscription charges are
   *computed* into summaries/budgets, never materialized as transactions.

## State management

- Server state: the single bootstrap query. No Redux/Zustand/context stores.
- UI state: local `useState` per screen; QuickAdd sheet via a small context;
  theme preference in localStorage (`tower-theme`); update-check cache in
  localStorage. **Nothing auth-related is ever in localStorage.**

## API layer

Hono + zod validation at the boundary; better-sqlite3 (synchronous, WAL).
Routes under `/api`: `bootstrap`, CRUD for `transactions`, `categories`
(delete requires `reassignTo` when in use — also remaps subscriptions and
templates), `plans` (+ `PUT/DELETE /plans/:id/payments/:month` overrides),
`subscriptions`, `templates`, `PUT settings`, `GET export` / `POST import`
(transactional replace; preserves `auth_hash`), `POST login|logout|auth`.
The server also serves the built client from `dist/client` with SPA fallback.

## Authentication

- Optional password → scrypt hash (`s1:<salt>:<hash>`) in settings row
  `auth_hash`. Never exported, never sent to the client.
- Login creates a random 32-byte session token → **httpOnly SameSite=Lax
  cookie** (`tower_session`, 180d). Only the token's SHA-256 is stored in the
  `sessions` table (DB leak ≠ usable sessions).
- Middleware: when a hash exists, every `/api` route except `login`/`logout`
  requires a valid session (lookup + `last_seen` touch).
- Rate limiting: in-memory, 10 failed attempts / 15 min per client
  (`x-forwarded-for` or `'local'`) on login and auth management → 429.
- Change/disable password → `clearSessions` (all devices signed out); change
  issues the caller a fresh session. `/api/logout` = lock (one device).
- Client: 401 from bootstrap renders `PasswordGate` (App.tsx); 401s are
  non-retryable in the QueryClient so locking is instant.

## Important design decisions

- **Cycle keying** (`cycles.ts`): a cycle is keyed `YYYY-MM` by the month its
  salary lands in; bounds = `salaryDate(label)` → day before
  `salaryDate(label+1)`; weekend rule shifts the payout date. Displayed via
  `fmtCycle()` as a date range. Keys share the calendar-month namespace, so
  plan months (natively `YYYY-MM`) map 1:1 under both bucketings.
- **Dual bucketing**: calc functions take `bucket?: CycleSettings`. Default =
  user's cycle settings (budgeting); `CALENDAR` = calendar months (dashboard
  trend charts, Months-page toggle). UI always labels which one is in use.
- **Client-side calc** keeps the API a dumb CRUD layer and makes optimistic
  updates exact (totals recompute locally before the server responds).
- **Plan cascade** (`planSchedule`): scheduled = min(installment, remaining);
  counted = override ?? scheduled (capped at remaining); overrides ripple
  forward; paid/status only counts months ≤ current cycle.
- **Service worker** precaches the app shell only — `/api` is never cached
  (privacy). PWA works installed/fullscreen, but live data needs the server.
- **Schema migration** = `CREATE TABLE IF NOT EXISTS` + settings defaults at
  boot; old JSON backups import via zod defaults for missing fields.
- **No NaN policy**: every division guarded; money via `round2` + EPS (0.005).
