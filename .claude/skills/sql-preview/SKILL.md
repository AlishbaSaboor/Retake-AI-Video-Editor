---
name: sql-preview
description: Run a read-only ad hoc SQL query against a target environment (local, preview, or staging) for debugging. Use when you need to inspect actual data or verify a query's shape rather than guess from the schema.
---

# SQL preview (read-only)

Run a single read-only query against a target database, for debugging or
verifying data shape — never for writes.

**Connection.** Resolve the target connection string from an env var chosen
at call time (`DATABASE_URL` for local, `STAGING_DATABASE_URL` for staging,
or a preview-deployment URL passed explicitly) — never a value hardcoded in
this file, and never read from a populated `.env.local`/`.env` file on disk
(those may contain production credentials on some machines; ask the user
which env var to use if it's ambiguous).

```bash
psql "$TARGET_DATABASE_URL" -c "<read-only query>"
```

## Rules

- `SELECT` only. If the user's question actually requires a write, stop and
  say so explicitly rather than running it — this skill is for inspection.
- Never target a production connection string without the user explicitly
  naming production and approving the exact query first.
- Prefer `LIMIT` on exploratory queries against large tables.
