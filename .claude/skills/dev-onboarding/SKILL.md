---
name: dev-onboarding
description: Get a new developer's local environment running on an already-set-up project generated from this template — not for creating a new project (see template-setup for that). Walks through install, env vars, migrations, and confirming the dev server actually boots. Use when the user says "/dev-onboarding", "I just joined this project", "get my local env running", "set up my machine for this repo", or is new to a repo whose package.json name is no longer "8x-web-template".
---

# Dev onboarding

For a developer who has clone/pull access to an **already-customized**
project (post `template-setup`) and needs to get productive locally. If
`package.json`'s `"name"` is still `8x-web-template`, this is the wrong
skill — that's `template-setup`'s job (creating/naming a new project), not
this one (getting an existing project running on a new machine).

## 1. Install

```bash
pnpm install
```

This does two things beyond installing packages, both automatic — nothing
else to run by hand:

- Installs the commit-msg git hook (`prepare` script) — Conventional
  Commits get enforced locally, not just in CI.
- Regenerates the Prisma client (`postinstall` script) — you never need to
  run `prisma generate` yourself after a fresh install.

## 2. Local Supabase (database + auth, nothing hosted)

Local development runs entirely on the Supabase CLI — Postgres and auth in
Docker on your machine, no hosted Supabase account. Needs Docker Desktop
running (on Windows, WSL2 too); the CLI runs through `pnpm dlx`, so there is
nothing to install globally.

```bash
pnpm dlx supabase start      # first run downloads ~2 GB of images
pnpm dlx supabase status     # prints the URLs and keys used below
```

`supabase/config.toml` is committed and already tuned to this repo's rules:
the Data API is **off** (`docs/rules/auth.md`), only Postgres, auth, the API
gateway and the Mailpit inbox (http://127.0.0.1:54324, where sign-in emails
land) run, and auth redirects to `http://localhost:3000`. Turn Studio back on
in that file if you want the web UI.

If image pulls stall — no progress for minutes, and `docker ps -a` empty
because containers are only created once every image is pulled — kill
`supabase start`, `docker pull` the missing images one at a time (names are
in its error output), then start again.

## 3. Environment variables

```bash
cp .env.example .env.local
```

Every variable in `.env.example` has an inline comment explaining what
it's for. Fill these from `supabase status`:

- `DATABASE_URL` and `DIRECT_URL` — both the status `DB_URL`
  (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); locally
  there is no pooler, so they're the same.
- `NEXT_PUBLIC_SUPABASE_URL` — `http://127.0.0.1:54321` (the API gateway;
  status omits an API URL because the Data API is disabled).
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` — the
  status `PUBLISHABLE_KEY` / `SECRET_KEY`.
- `CRON_SECRET` — any value locally (`openssl rand -hex 32`); only needs
  to match production if you're testing a cron route end to end.

If `src/lib/supabase/` is absent, this project removed auth per
`docs/rules/auth.md` and the Supabase keys don't apply — you still need the
local Postgres for `DATABASE_URL`.

Sentry/PostHog vars can stay empty locally — both no-op gracefully. Don't
spend time chasing real values for these unless you're specifically
testing observability.

Run `pnpm check:env` after filling in `.env.local` — it won't validate the
_values_, but it confirms nothing the app actually reads is missing.

## 4. Database

The Prisma CLI and the repo's db scripts read `.env`, not `.env.local`, so
load it into the shell first:

```bash
set -a && . ./.env.local && set +a
pnpm exec prisma migrate deploy
pnpm db:run-once
pnpm check:rls       # every table: RLS on, no policies, not forced
```

The first applies every committed migration; the second applies
`prisma/run-once.sql`, the current one-off, if this database hasn't had it
yet — a ledger keyed by content hash makes it safe to run any time (see
`docs/rules/migrations.md`). It's a no-op while the file is empty. Never
`prisma migrate dev` against a shared database (same doc) — `migrate dev` is
for authoring a new schema change, not for catching an existing database up
to what's already committed.

## 5. Boot it

```bash
pnpm dev
```

Open the URL it prints — if the project has i18n, it redirects to a
locale-prefixed path automatically. If this fails, work through it in
order: env vars first (the most common cause), then whether migrations
actually applied, then whether `node_modules` is stale
(`rm -rf node_modules && pnpm install`).

## 6. Before your first commit

Read `AGENTS.md` — a short index into `docs/rules/*.md` covering database
access, migrations, auth, state management, code style, code quality,
feature approach, commits, pull requests, and deployment. Read
`docs/rules/commits.md` and `docs/rules/pull-requests.md` specifically
before you push anything: **don't commit once per fix while iterating**,
and don't write a PR's real title/description until the work is actually
done (open it draft if it needs to exist earlier) — run `local-review`
before committing, so CI confirms a change that already works instead of
being how you discover whether it
does. Every push is a real, paid CI run.

## 7. If you're also setting up infrastructure, not just local dev

That's a separate, one-time job — see `docs/CI_CD_SETUP.md` for GitHub
secrets/environments and Vercel configuration. Most developers joining an
existing project don't need this; it's for whoever originally ran
`template-setup` or is provisioning a new environment from scratch.
