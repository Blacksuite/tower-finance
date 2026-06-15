# Updating

Updating now lives in the README — it's just a Docker image pull:

```bash
docker compose pull && docker compose up -d
```

Your data in `./data` is untouched and schema migrations run automatically.

See **[README → Updating](../README.md#updating)** for version pinning, rollback,
backups, restore, and the forgot-password recovery step.
