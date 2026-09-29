---
name: seed-for-pr
description: Seed a local or preview database with representative fixture data using the app's own Prisma client. Use before manually testing a feature that needs realistic data to exercise (e.g. a list view, a dashboard, a filter).
---

# Seed for PR

Populate a target database with representative fixture data through the
app's own Prisma client (`@/server/db/client`) — never raw SQL — so seeding
can never drift from the current schema or bypass a constraint the app
itself would enforce.

## Process

1. Confirm the target: local (`DATABASE_URL` from `.env.local`) or a preview
   deployment's database (ask for the connection string explicitly — don't
   assume). Never seed staging or production without explicit approval.
2. Write or reuse a script under `scripts/` that imports `db` from
   `@/server/db/client` and calls `db.<model>.create(...)`/`upsert(...)` for
   the fixtures the feature under test needs — favor `upsert` so the script
   is safe to re-run.
3. Run it with `DATABASE_URL="$TARGET" pnpm tsx scripts/seed-<name>.mjs` (or
   equivalent) and report what was created.
4. If the project has no seed script yet for the entity being tested, write
   a minimal one scoped to just what's needed — don't build a general-purpose
   seeding framework speculatively.
