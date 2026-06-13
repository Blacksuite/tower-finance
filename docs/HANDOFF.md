# Handoff

## Current project status

**v1.2.0, released and deployed.** Public MIT repo at
`github.com/Blacksuite/tower-finance`; GitHub Actions runs tests and publishes
`ghcr.io/blacksuite/tower-finance` (`latest` + semver tags) on every push to
`main` and on `v*` tags — CI is green and the package is publicly pullable.
73/73 tests pass, `npm run lint` and `npm run build` are clean. The app is
feature-complete for its v1 scope and has been through a security/privacy
hardening pass (cookie sessions, rate limiting, no API caching).

## Recently completed (v6, most recent release)

- Server-side sessions in httpOnly cookies replacing a localStorage token
  that was the password hash itself; rate-limited auth endpoints; lock/logout
  (mobile top bar + desktop sidebar); 401s gate instantly.
- Mobile navigation rework: top bar (brand, lock, settings gear, owns the iOS
  safe-area) + tab bar Dashboard/Months/+/Plans/History.
- Service worker no longer caches `/api` (old `api-cache` purged on clients).
- Cycle-vs-calendar labeling on every aggregate; dates in English app-wide.
- README rewritten for open-source audiences; personal infra refs removed.
- Earlier this session: pay-cycle engine + date-range labels, subscriptions,
  expense templates, History filters, net worth with plan liabilities,
  in-app password management, update banner, full overflow audit.

## Outstanding issues / next candidates

1. **SSO (explicitly deferred by owner)**: owner wants to be *asked* before
   implementing — Pocket ID support via a provider-based OIDC/OAuth
   architecture while keeping local password auth. Do not start unprompted.
2. **In-app updates**: the banner only *notifies* (GitHub tags API). Owner
   discussed but did not approve one-click self-update (would need the Docker
   socket — security trade-off documented in conversation; revisit if asked).
3. **Multi-arch images**: CI builds `linux/amd64` only — add `arm64` for
   Raspberry Pi users (one line in `release.yml`, but slower builds).
4. **README screenshots** would help adoption; none exist yet.
5. **Unraid Community Applications template** for discoverability.
6. Rate limiter is in-memory/per-process and keys on `x-forwarded-for` —
  fine for LAN single-user; document/harden if multi-user ever happens.

## Known bugs

None currently known. Quirks to be aware of: changing currency/locale in
Settings triggers a `location.reload()` (module-level formatters); the
transaction-row swipe-to-delete uses framer-motion drag with a click-guard
ref; Vitest needs `vitest.config.ts` (vite root is `src/client`).

## Important files

- `src/shared/calc.ts` — every derived number; change with tests.
- `src/shared/cycles.ts` — pay-cycle engine (keying decisions documented).
- `src/server/app.ts` — auth middleware/sessions/rate limit + all routes.
- `src/server/db.ts` — schema, auto-migrations, import/export, sessions.
- `src/client/api/data.ts` — bootstrap query + optimistic mutation pattern.
- `src/client/components/Layout.tsx` — all navigation (top bar/tab bar/sidebar).
- `tests/` — auth/session flows, cycle math, plan cascade; mirror new logic here.
- `CLAUDE.md` (root) — conventions and hard-won gotchas. Read it first.

## Current branch

`main`, clean tree, in sync with `origin/main`, tagged through `v1.2.0`.
Releases: bump `package.json` version → commit → `git tag vX.Y.Z` →
`git push origin main vX.Y.Z` (CI publishes the image).

## Recommended next tasks

1. Add `linux/arm64` to the CI build platforms.
2. Take screenshots (seed via API, preview tooling, 390px + 1440px) for README.
3. Ask the owner about SSO (item 1 above) before any auth expansion.
4. Consider GitHub Releases with changelogs per tag (currently tags only).
