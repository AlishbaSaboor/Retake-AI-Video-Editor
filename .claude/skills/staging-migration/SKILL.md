---
name: staging-migration
description: Reconcile a preview/staging database against this branch's full Prisma migration set without polluting the shared migration history on main. Use when a preview/staging deploy errors with a missing-column/relation error because it's missing this branch's new schema.
---

# Staging migration (manual, non-destructive)

Reconcile a shared **staging** database against this branch's **entire**
migration set, without recording anything in a way that would break
`prisma migrate deploy` for `main` or other branches.

**Connection.** Read the target connection string from an env var resolved
at runtime — `STAGING_DATABASE_URL` by default, or whatever this project's
`.env.example` documents for its staging environment. **Never hardcode a
project ref, hostname, or connection string in this file.** A skill ported
from another repo that had a hardcoded connection string is exactly the
failure mode this convention exists to avoid — it silently points at the
wrong (or no) database in every project that copies the skill.

```bash
if [ -z "$STAGING_DATABASE_URL" ]; then
  echo "STAGING_DATABASE_URL is not set — check .env.example for this project's staging var name and export it, then retry."
  exit 1
fi
```

## When to use

- A PR's preview/staging deploy fails with `column/relation does not exist`
  because staging hasn't been migrated to include this branch's new schema
  yet, and you want to unblock manual testing before merge (CI's own
  `migrations` job only replays into a throwaway database, not the shared
  staging one).

## When NOT to use

- Production — production only gets migrated by
  `.github/workflows/deploy-migrations.yml` on push to `main`. Never point
  this skill at a production connection string.
- Destructive migrations (`DROP`/rename/type-narrowing) — these affect
  every branch sharing staging and aren't safely re-appliable. Flag them and
  confirm explicitly with the user before proceeding.

## Process

1. Enumerate every migration under `prisma/schema/migrations/*/migration.sql`
   in directory order (timestamp-prefixed, so directory order = apply
   order) — not just what's new vs. `main`, the full set, so a
   partially-synced staging self-heals.
2. For each migration, check whether its directory name is already recorded
   in Prisma's `_prisma_migrations` table on the target database
   (`SELECT migration_name FROM _prisma_migrations`).
3. For anything not yet recorded, apply the migration's SQL directly via
   `psql "$STAGING_DATABASE_URL" -f <path>/migration.sql`, then insert a
   matching row into `_prisma_migrations` so `prisma migrate deploy` sees it
   as applied later and doesn't try to re-run it.
4. Run `node scripts/run-once-sql.mjs --db-url "$STAGING_DATABASE_URL"` so
   staging gets the current one-off in `prisma/run-once.sql` if it hasn't
   had it yet (the runner's ledger skips a version staging already applied,
   so this is safe to repeat — see `docs/rules/migrations.md`).
5. Report which migrations were applied and which were already present.
