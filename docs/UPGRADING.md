# Deployment & Upgrade Guide

Tower Finance stores **everything** in one SQLite file: `./data/tower.db`
(mounted into the container at `/app/data`). As long as that file survives,
your data survives. The container itself is disposable.

## Recommended update workflow

The repo lives on GitHub; never copy files around by hand. Easiest path:

```bash
cd /path/to/tower-finance
./scripts/update.sh     # backs up the DB, git pull, rebuild, restart
```

Or manually:

```bash
# 1. Back up the database first (always)
mkdir -p backups
sqlite3 data/tower.db ".backup backups/tower-$(date +%F).db"
#    └─ no sqlite3 on the host? stop the stack first, then: cp data/tower.db backups/

# 2. Pull the new version (source mode)
git pull --ff-only

# 3. Rebuild and restart — data is untouched because ./data is a volume
docker compose up -d --build

# 4. Verify
docker compose logs --tail 5 tower-finance   # "Tower Finance listening on ..."
```

Open the app and check the dashboard (the running version is shown at the
bottom of Settings). Done.

### Registry mode (prebuilt images, no local build)

GitHub Actions publishes images to GHCR on every push to `main` and on
`v*` tags. To consume them instead of building locally, change
`docker-compose.yml`:

```yaml
services:
  tower-finance:
    image: ghcr.io/<owner>/tower-finance:latest   # or pin :1.1.0
    # build: .          ← remove/comment the build line
```

Then updating is just `docker compose pull && docker compose up -d`, and
**rollback** is pinning the previous tag (e.g. `:1.0.0`) and `up -d` again.
For a private repo run `docker login ghcr.io` once with a GitHub token
(`read:packages`).

## Migrations

Schema changes are applied automatically at startup (`CREATE TABLE IF NOT
EXISTS` + seeded defaults). New settings (salary cycle, currency, password)
default to the previous behavior — calendar-month budgeting, EUR/nl-NL, no
password — so upgrading never requires manual migration steps or new
configuration. Old JSON backups import cleanly; missing fields get defaults.

## Restoring a backup

```bash
docker compose down
cp backups/tower-2026-06-11.db data/tower.db
rm -f data/tower.db-wal data/tower.db-shm   # discard stale WAL state
docker compose up -d
```

Alternatively use **Settings → Backup → Import JSON** in the app (replaces all
data; the app password is preserved and is never part of JSON backups).

## Rollback

If a new version misbehaves:

```bash
docker compose down
git checkout <previous-tag-or-commit>   # source mode — or pin the image tag
docker compose up -d --build
```

Then restore the pre-upgrade database backup as above **if** the newer version
already wrote data you want to discard. Downgrading without restoring is
usually fine — older versions ignore unknown tables/columns — but the backup
is your guarantee.

## Notes

- **Password protection** is managed entirely inside the app (Settings →
  Security): no environment variables, no redeployment. The password is stored
  as a salted scrypt hash in the database. If you forget it, delete the
  `auth_hash` row: `sqlite3 data/tower.db "DELETE FROM settings WHERE key='auth_hash'"`.
- The WAL files (`tower.db-wal`, `tower.db-shm`) are part of the live
  database; for file-copy backups of a *running* instance prefer
  `sqlite3 .backup`, which produces a single consistent file.
- Keep the host port mapping (`3210:3210`) in `docker-compose.yml` if you
  reverse-proxy; nothing else in the compose file needs changing across
  versions.
