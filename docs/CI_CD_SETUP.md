# CI/CD setup — GitHub and Vercel

What has to exist in GitHub and Vercel before this template's workflows
actually work end to end, not just look correct in the YAML. Do this once,
right after `template-setup` (see `.claude/skills/template-setup/`), before
the first real PR.

## GitHub

### Claude review

The repository's small Claude workflow calls the reusable review owned by
`8xsocial/8x-moad`. No Claude credential belongs in this repository. The
organization-level `CLAUDE_CODE_OAUTH_TOKEN` must include this repository,
and Moad's Actions access setting must allow workflows from the organization.

### Repository secrets

Settings → Secrets and variables → Actions → Repository secrets.

| Secret             | Required by                                   | What happens if it's missing                                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MIGRATIONS_TOKEN` | `.github/workflows/ci.yml`'s `migrations` job | Falls back to the default `GITHUB_TOKEN`, which _can_ push the generated-migration commit, but that commit's own CI run then sits in `action_required` waiting for a human to manually approve it in the Actions tab — a green PR can be a false signal until someone notices. See below for how to provision this properly. |

`MIGRATIONS_TOKEN` needs `contents: write` on this repo — nothing else.
Two ways to get one, in order of preference:

**A GitHub App (recommended — this is a template, not a one-off repo).**
One app, installed on the org, works across every project generated from
this template without minting a new token per repo:

1. Org Settings → Developer settings → GitHub Apps → New GitHub App.
2. Repository permissions → Contents: Read and write. Nothing else needed.
3. Install the app on whichever repos need it (or the whole org).
4. The `migrations` job already wires this in: it calls
   [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token)
   to exchange the App's credentials for a short-lived installation token,
   with a fallback chain of App token → `MIGRATIONS_TOKEN` PAT →
   `GITHUB_TOKEN`. You just provide the two values, once, ideally at the org
   level so every repo inherits them:
   - `MIGRATIONS_APP_ID` — a repository (or org) **variable**, not a secret.
     It has to be a variable because the step is gated on
     `if: vars.MIGRATIONS_APP_ID != ''`, and `secrets` isn't a valid context
     in `if:`. Until it's set, the
     App step is skipped and the job falls through to the token chain, so an
     unconfigured repo still works — it just gets the `GITHUB_TOKEN`
     `action_required` behavior described above.
   - `MIGRATIONS_APP_PRIVATE_KEY` — a **secret** (the App's generated
     private key).

   This avoids per-repo token rotation entirely and needs no YAML edits.

**A fine-grained personal access token (quicker for a single repo).**

1. github.com → Settings (personal) → Developer settings → Fine-grained
   tokens → Generate new token.
2. Resource owner: the org. Repository access: only this repo.
3. Permissions → Contents: Read and write.
4. Set an expiration and put a reminder on your calendar to rotate it —
   fine-grained PATs expire (max 1 year) and the migrations job will start
   silently falling back to `GITHUB_TOKEN` the day it does.
5. Copy the token → this repo's Settings → Secrets and variables → Actions
   → New repository secret → name it `MIGRATIONS_TOKEN`.

### Environments

Settings → Environments → New environment → `production-database`.

Used by `.github/workflows/deploy-migrations.yml`, which applies migrations
and then `prisma/run-once.sql` (see `docs/rules/migrations.md`) to
production on every push to `main`. Add one environment secret here (not a
repository secret — keep it scoped to this environment only):

| Secret                    | Value                                                                                                                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRODUCTION_DATABASE_URL` | The production Postgres connection string, **session pooler, port 5432** — not the transaction pooler on 6543. `prisma migrate deploy` holds an advisory lock across statements that transaction-mode pgbouncer can't sustain; using the wrong port here is the most common way this job silently hangs. |

Consider adding required reviewers or a deployment branch rule (restrict
to `main`) on this environment if the team wants a human checkpoint before
migrations hit production, on top of the PR review that already happened
before the merge that triggers this workflow.

### Branch protection

Settings → Branches → Add rule → `main`:

- Require a pull request before merging.
- Require status checks to pass: `commits`, `check`, `build`, `e2e`,
  `migrations` (the job names from `ci.yml`).
- Require branches to be up to date before merging.

Without this, the CI jobs run and report status but nothing stops a direct
push or a merge with a red check.

### Optional: a second AI reviewer

This template ships only the Claude review job. If the team wants the
dual-reviewer pattern 8x-core uses (Claude + Codex, so a blind spot in one
model's prompt doesn't get a free pass), that needs an `OPENAI_API_KEY`
repository secret and a `codex-code-review.yml` workflow — not included by
default here; see the design guide's open decisions.

## Vercel

### Connect the repo

Vercel dashboard → Add New → Project → import this GitHub repo. Framework
preset auto-detects as Next.js; root directory stays `.` (this template is
a flat app, not a monorepo — see the design guide's open decisions if that
changes). No Vercel-side build command changes are needed.

### Environment variables

Project Settings → Environment Variables. Mirror `.env.example` — every
variable there except the ones below needs a value in at least the
Production environment, and usually Preview too if you want preview
deployments to work fully:

| Variable                                                 | Set in Vercel?                            | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                           | Yes, Production + Preview                 | Pooled connection (port 6543). Consider a separate Preview-only database/branch so preview deployments don't share production data.                                                                                                                                                                                                                                                                                                                                                                         |
| `DIRECT_URL`                                             | **No**                                    | Only the Prisma CLI's `migrate` commands read this, never the running app (see `src/lib/env.ts`) — GitHub Actions sets it directly as a job env var when needed. **Do not set it in Vercel:** the deployed app never reads it, so it sits there as a full-DDL `postgres` credential with no function. `prisma generate` is the one Prisma command that doesn't need it and the only one a Vercel build runs, so nothing fails to signal the mistake — three projects carried it unnoticed until 2026-09-09. |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Yes                                       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SENTRY_AUTH_TOKEN`                                      | Yes, mark **Sensitive**                   | Needed at _build_ time (source-map upload), not just runtime — Vercel builds run with your env vars available, so this has to be set here even though it's never read by the deployed app itself.                                                                                                                                                                                                                                                                                                           |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`    | Yes                                       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POSTHOG_PERSONAL_API_KEY`                               | Yes, if using server-side flag evaluation |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `NEXT_PUBLIC_DEFAULT_LOCALE`                             | Yes                                       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `CRON_SECRET`                                            | Only for cron routes                      | MOAD generates it separately for production and preview. Cron routes reject all requests when unset.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `NEXT_PUBLIC_APP_URL`                                    | Yes, per environment                      | Production gets the real domain; Preview can usually be left pointing at production or use Vercel's `VERCEL_URL` — decide per project, this template doesn't presume one.                                                                                                                                                                                                                                                                                                                                   |

### Git integration behavior — decide this explicitly

By default, Vercel auto-deploys every push: `main` → Production, every
other branch/PR → a Preview deployment. That's what this template assumes
and requires no extra setup.

The org also has a **tag-gated release pattern** in active use (8x-brands):
`vercel.json` sets `"git": { "deploymentEnabled": false }` so pushes to
`main` only run CI, and a separate GitHub Actions workflow deploys to
production only on a `v*` tag push (`vercel pull` → `vercel build --prod`
→ `vercel deploy --prebuilt --prod`), matching the release process in the
org's root-level `deployment.md` rule (`git tag vX.Y.Z` + `gh release
create`). This template does **not** implement that by default — decide
explicitly which one this project wants rather than assuming; if it's the
tag-gated flow, copy 8x-brands' `vercel.json` and
`.github/workflows/deploy-production.yml` as the starting point rather
than writing it from scratch.

## Shared database previews

MOAD gives Vercel production and previews the same `DATABASE_URL` and
Supabase Auth credentials. There is no additional preview database by default.
Preview actions can change live data, so use intentional test accounts and
avoid production-changing automated tests.

PR CI validates migrations and `prisma/run-once.sql` against a throwaway
Postgres service. Only the production deployment workflow applies them to
the live database after merge. Never run PR migrations against the shared
production database. Features needing new schema become usable after that
migration has deployed.

MOAD generates separate production and preview `CRON_SECRET` values and keeps
existing values on retries. An unset secret disables cron access without
preventing unrelated routes from booting. A separate preview database remains
an explicit project choice.
