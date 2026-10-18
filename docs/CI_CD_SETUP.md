# CI/CD setup — GitHub

What the GitHub workflows need. Hosting (Vercel and the hosted Supabase
project) is set up outside GitHub: see `docs/rules/deployment.md`.

## Workflows

- **`.github/workflows/ci.yml`** — every push to `main` and every pull
  request: `check` (lint, typecheck, Prettier, `check:env`,
  `check:secrets`, unit tests) and `build`.
- **`.github/workflows/manual.yml`** — only when started by hand (Actions →
  Manual tests → Run workflow, on any branch): `e2e` (4 shards),
  `migrations` (replay, run-once SQL, drift, RLS), `db-tests` and
  `ai-models`. Run it before merging a branch that changes the editor's
  flows or the schema.

## Secrets

None. Every job runs against placeholders or its own throwaway Postgres
service, and no AI call leaves the runner. No workflow migrates the hosted
database: migrations are applied by hand before the deploy that needs them
(`docs/rules/deployment.md`).

## Branch protection (optional)

Settings → Branches → Add rule → `main`: require status checks `check` and
`build` to pass before merging.

## Hosting

Vercel, through its GitHub integration (production from `main`, a
preview per pull request), with a hosted Supabase project for Postgres and
auth: `docs/rules/deployment.md`.
