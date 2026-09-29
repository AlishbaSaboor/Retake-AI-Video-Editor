# Do not add files here by hand

This directory is generated exclusively by CI (`.github/workflows/ci.yml`'s
`migrations` job, via `scripts/generate-migration.mjs`). See
`docs/rules/migrations.md` for the full workflow. (Other repos in the org
use a different, Supabase-CLI based migration workflow — it doesn't apply
to this repo.)

Short version: edit `prisma/schema/*.prisma`, open a PR, CI diffs your schema
against the replayed migration history and commits the missing migration
back onto your branch. If you ever find yourself about to run
`prisma migrate dev` against a shared database or hand-write a file in this
folder, stop — that's the one thing this workflow exists to prevent.

One-off SQL that isn't a schema change (a data fix, reference rows, a view,
an extension) goes in `prisma/run-once.sql`, not here — the next deploy
applies it once per database and a ledger keeps it from running again. Same
doc, "Run-once SQL".
