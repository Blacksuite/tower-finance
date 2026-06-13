# Session summary (project bootstrap → v1.2.0)

This project went from an empty folder to a released open-source app in one
extended session (v1…v6, 11–12 Jun 2026). Highlights a new agent should know.

## Major decisions

- **Stack**: React+Vite+TS / Hono / better-sqlite3 / single Docker container.
  All financial math client-side in `src/shared/calc.ts` so optimistic UI is
  exact and the API stays dumb CRUD.
- **Pay-cycle semantics changed twice, deliberately.** First: cycles labeled
  by the month they "fund" (26 Jun–25 Jul = "July"). Owner found it confusing
  ("my salary disappears into next month"). Final design (owner-confirmed):
  cycles keyed by the month the salary lands in, and **displayed as the raw
  date range** ("26 Jun – 25 Jul 2026") — never a month name — while
  **calendar months remain for reporting** (dashboard trends, Months-page
  toggle, both always labeled). Don't re-litigate this.
- **Auth evolution**: env-var password → in-app scrypt hash where the hash
  doubled as the session token in localStorage → (final, v6) random-token
  sessions in httpOnly cookies, SHA-256 of token in DB, rate limiting, lock.
- **Dates are always English** (en-GB) regardless of the number/currency
  locale setting — owner wants months matching the English UI.
- **Privacy stance**: the service worker must never cache `/api`; "offline"
  claims limited to the app shell.
- Distribution: public repo + GHCR images via Actions; updating =
  `docker compose pull`. Owner explicitly wants everything free.

## Features added (chronological)

v1 core app (dashboard ribbon, months, plans cascade, budgets, PWA, Docker) →
v4 salary cycles, subscriptions, templates, History filters, net worth with
liabilities, in-app password → v5 date-range cycle labels, calendar/cycle dual
bucketing, form-submit bugfix, CLAUDE.md, GitHub+CI → v6 security hardening,
nav rework, update banner, English dates, README rewrite.

## Problems encountered (and root causes)

- **Untyped `<button>` inside `<form>` submits it** — the Segmented control
  silently saved transactions on type-toggle taps and corrupted data during
  testing. Rule now in CLAUDE.md; every in-form button needs explicit `type`.
- **Grid/flex sizing traps**: `.main` (grid item with auto margins) shrank to
  content width on desktop until given `width:100%`; `1fr` grid columns blew
  out from nowrap children (need `minmax(0,1fr)`); inline spans can't
  ellipsize (need `display:block`).
- **Ribbon hover flicker**: swapping header content on hover changed card
  height → bar moved under the pointer → mouseleave loop. Fixed by rendering
  hover info as an absolutely-positioned overlay (zero layout impact).
- **GitHub Actions `startup_failure` in 0s** was an *account-level billing
  lock*, not workflow YAML — even a bare echo workflow failed. Repo going
  public + owner fixing billing resolved it.
- **OAuth scope**: pushing `.github/workflows/` needs the `workflow` scope
  (`gh auth refresh -s workflow`).

## Failed approaches and why

- Derived "recurring suggestions" from transaction history — superseded by
  proper template + subscription tables (owner wanted real management).
- Password-hash-as-bearer-token in localStorage — worked but is
  password-equivalent material in JS-readable storage; replaced by sessions.
- `--force-with-lease` after `git filter-branch` — lease ref was rewritten
  locally; needed plain `--force` (single-author repo, fine).
- Perl one-liners interpolating `${var}` into JSX template literals — shell
  perl eats them; use Edit-tool replacements for those.

## What the next agent should know

- Read root `CLAUDE.md` first; `docs/ARCHITECTURE.md` for structure;
  `docs/HANDOFF.md` for status/next steps.
- Verification workflow that worked well: `npm run build`, preview tooling on
  port 3210, seed via the API with a payday-26 dataset, then DOM-based checks
  + an overflow detector at 360/390/768/1024/1440/1920. Wipe `data/`
  afterwards — the preview panel is live and the owner may click around in it
  (stray test transactions have caused confusion twice).
- Tests gate CI: any auth/calc change needs matching tests in `tests/`.
- The owner prefers being asked (AskUserQuestion) about product-semantics
  choices (cycle naming, net-worth definition came from such questions), is
  budget-conscious about tooling costs, and wants the project free to run.
