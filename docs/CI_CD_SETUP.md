# CI/CD setup — GitHub

What has to exist in GitHub before this repo's workflows actually work end
to end, not just look correct in the YAML. Do this once, right after
`template-setup` (see `.claude/skills/template-setup/`), before the first
real PR. Retake isn't deployed, so there's no hosting to set up (see
`docs/rules/deployment.md`).

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

None. Retake isn't deployed and has no production database, so there's no
`production-database` environment and no workflow that migrates one.

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

## Hosting

None. Retake isn't deployed (`docs/rules/deployment.md`): there's no Vercel
project and no preview or production database. Pull-request CI validates the
migrations and `prisma/run-once.sql` against a throwaway Postgres service;
nothing applies them to a hosted database.
