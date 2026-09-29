# Engineering standards — the checklist, and the check that proves it

What every 8x repo carries, whatever its stack, and the deterministic check
that says whether it actually does: `pnpm check:standards`
(`scripts/check-standards.mjs`). No network, no model, the same answer on
every run, an exit code CI can gate on.

This started as `docs/STANDARDS-MIGRATION.md` in
[app-discovery](https://github.com/8xsocial/app-discovery) — the record of
bringing a plain-Node/Supabase pipeline, which shares none of this template's
framework choices, onto these standards in one PR
([#14](https://github.com/8xsocial/app-discovery/pull/14)) and Prisma in a
second ([#15](https://github.com/8xsocial/app-discovery/pull/15)). That
migration is where the list below was tested against a repo that had none of
it. The template is where the standards come from, so the definition lives
here, and the check keeps it honest.

It has two jobs:

1. **A gate.** CI runs it on every pull request, here and in every project
   generated from this template, so a standard cannot be quietly unwired — a
   rule file deleted without unlinking it, a CI job dropped in a refactor, a
   hook committed without its executable bit.
2. **An audit.** `--root` points it at another checkout. The failures are the
   to-do list for bringing that repo onto the standards, in the order the
   [playbook](#bringing-an-existing-repo-onto-the-standards) below gives.

## What "standard" means here

The rules in `AGENTS.md` split into two halves. **Engineering discipline** —
agent instructions, CI on pull requests, lint, format, strict TypeScript, one
env schema, commit hygiene, secret scanning, tracked session transcripts, no
machine-local state in git — applies to every repo the org owns. **Stack conventions** —
Prisma-only data access, CI-generated migrations, Server/Client Component
boundaries, TanStack Query — apply to repos on this template's stack and are
a rewrite, not a standards pass, anywhere else.

The check covers the first half mechanically, plus the part of the second
half that can be locked structurally rather than judged: a restricted import,
a narrowed type, a catalog query (the [data layer](#data-layer) table). The
rest of the second half stays with `local-review`'s manual pass and the AI
review — not because it matters less, but because judging it means reading
the code, not the scaffolding, and a check that has to read the code is not
deterministic in the way this one is.

Every check that scans text asserts it found something before judging what it
found. app-discovery's `check:env` once passed for weeks by matching zero
variables (see [what nearly went wrong](#what-nearly-went-wrong)); a check
that can pass by matching nothing is not a check.

## The standards

Each row is one check in `scripts/check-standards.mjs`, by id. The "why"
column cites the incident where there was one.

### Agent instructions

| id                        | standard                                                                                                            | why                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents-md`               | `AGENTS.md` exists and has an `## Engineering rules` section.                                                       | It is the one file every coding agent reads — Claude, Codex, Cursor, Gemini. A repo without it has no rules an agent will follow.                    |
| `agents-md-links-resolve` | Every `docs/rules/*.md` that `AGENTS.md` links to exists. Fails if it links to nothing at all.                      | A dangling link is a rule an agent is told to read and cannot.                                                                                       |
| `rules-all-linked`        | Every file in `docs/rules/` is linked from `AGENTS.md`.                                                             | An unlinked rule is a rule nobody is pointed at. Delete it or link it.                                                                               |
| `rules-core-set`          | `code-quality`, `commits`, `deployment`, `logging`, `migrations`, `pull-requests` exist under `docs/rules/`.        | The stack-agnostic core: the rules that applied to app-discovery in full. Stack-specific rules are covered by the two link checks rather than named. |
| `per-tool-entry-points`   | `CLAUDE.md` contains an `@AGENTS.md` line; so do `GEMINI.md`, `QWEN.md` and `.cursor/rules/project.mdc` if present. | Rules live once. A per-tool file that restates them drifts from the others the first time either is edited.                                          |
| `readme`                  | `README.md` exists.                                                                                                 | `AGENTS.md` is how to work in the repo; the README is what it does.                                                                                  |

### Commit discipline

| id                     | standard                                                                                                                                                                          | why                                                                                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `commit-msg-hook`      | `.githooks/commit-msg` exists, is executable on disk **and** `100755` in the git index, and calls `scripts/check-commit-message.mjs`.                                             | The index mode is what a fresh clone gets. A hook that is `+x` on one laptop and `100644` in git is a hook nobody else has.                                                                                                                                                                |
| `hooks-path-installed` | `package.json`'s `prepare` script runs `git config core.hooksPath .githooks`.                                                                                                     | Installing the hook by hand is a step that gets skipped. `\|\| exit 0` after it is fine and, on Vercel, required — the build strips `.git`, and a bare `git config` there exits 128.                                                                                                       |
| `ci-commits-job`       | CI runs `scripts/check-commit-message.mjs --range` over the PR's commits.                                                                                                         | One implementation, two enforcement points — the hook for the author, CI for the branch — so the rule can never drift between them (`docs/rules/commits.md`).                                                                                                                              |
| `secrets-scan`         | `scripts/check-secrets.mjs` exists; `.githooks/pre-commit` is executable **and** `100755` in the index and calls it; the `check:secrets` script runs it; CI runs `check:secrets`. | A credential pasted into a committed session transcript is the leak that gitignoring `.env*` can't stop. Two enforcement points — the pre-commit hook for the author, CI for the branch (a local `--no-verify` can't skip CI) — mirror the commit-message check (`docs/rules/secrets.md`). |

### Gates

| id                        | standard                                                                                                                                                    | why                                                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package-scripts`         | `package.json` defines `lint` (with `--max-warnings=0`), `typecheck`, `format`, `format:check`, `test`, `check:env`, `check:standards`.                     | Gates are package scripts so CI, `local-review` and a developer's shell all run the same command. A warning that doesn't fail is a warning nobody reads.                                                              |
| `ci-gates-every-pr`       | `.github/workflows/ci.yml` triggers on `pull_request` and invokes every gate above except `format`. `pnpm x`, `npm run x`, `yarn x`, `bun run x` all count. | Everything else on this page is advisory until something runs it on a branch. app-discovery had `typecheck` in `package.json` for months and it had never run in CI — every workflow was a cron or a manual dispatch. |
| `local-review-mirrors-ci` | The fenced command blocks in `.claude/skills/local-review/SKILL.md` invoke every gate CI runs. A mention in prose does not count.                           | CI confirms what was verified locally; it is never where a failure is first discovered. Every push is a paid CI run (`docs/rules/commits.md`).                                                                        |
| `eslint-effective-rules`  | For `src/lib/env.ts`, the ESLint config **in effect** has `@typescript-eslint/no-explicit-any` and `no-console` as errors (`eslint --print-config`).        | The resolved config, not the file: flat config resolves a rule by last match wins, so a rule can be written down and still be off. `docs/rules/code-quality.md` explains both rules.                                  |
| `typescript-strict`       | `tsc --showConfig` resolves `compilerOptions.strict` to `true`.                                                                                             | Resolved again, so an `extends` chain can't hide a `strict: false`.                                                                                                                                                   |
| `prettier-config`         | A Prettier config file and a `.prettierignore` exist.                                                                                                       | Formatting is a machine's job. Which style is per-repo — app-discovery kept its own to avoid rewriting 15k lines and erasing `git blame` — but there is a config and `format:check` enforces it.                      |

### Environment

| id           | standard                                                                                                                       | why                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `env-schema` | `src/lib/env.ts` imports `zod`; `.env.example` exists; `scripts/check-env-vars.mjs` exists and the `check:env` script runs it. | One file reads `process.env`, and a check keeps schema, `.env.example` and code in step. This surfaces the most per minute spent: 31 of app-discovery's 37 variables were undocumented, including every secret gating its dashboard. |

### Logging

Node server code uses Pino through `src/server/lib/logger`, with structured
JSON on stdout, severity filtering, async request/job correlation and
credential redaction. Feature code imports the wrapper, never Pino directly.
Unexpected exceptions still go through `captureError`/Sentry, and Client
Components use `captureClientError`; see [logging](rules/logging.md).

| id                  | standard                                                                                                                                                                                                                                                                                                          | why                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `structured-logger` | `pino` is a runtime dependency; the shared logger constructs it; its entry point, redaction and context modules exist; effective ESLint rules ban `pino` and `pino/**` in ordinary application code. Nonempty logger, redaction and context test files exist and the `test` script discovers `src/**/*.test.mts`. | A logging rule file alone does not prove a logger exists. One wrapper keeps credentials and request context consistent; contract tests cover the output and failure paths. |

This check proves the wiring. `pnpm test`, already required in CI and local
review, proves severity filtering, valid JSON, context isolation, error
serialization, credential scrubbing and safe serialization/sink failures.
The Node implementation is a stack convention; other runtimes need their
equivalent logger and checks rather than an unused Pino dependency.

### Repository hygiene

| id                               | standard                                                                                                                                                                                                                           | why                                                                                                                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `machine-local-state-ignored`    | `git check-ignore` confirms `.gitignore` ignores `.env`, `.env.local`, `.env.production`, `.vercel/project.json`, `node_modules/`, `.DS_Store` and `supabase/.temp/` — at the root **and** nested.                                 | app-discovery's root pattern never matched `b2b-dashboard/site/.vercel/project.json`, so a project id and pooler URL sat in git. Probing a nested path catches the pattern before it catches a file.                                                       |
| `no-machine-local-state-tracked` | `git ls-files` contains none of the above. `.env.example` is the one env file allowed.                                                                                                                                             | The pattern check is preventive; this one catches what already leaked.                                                                                                                                                                                     |
| `session-logs-tracked`           | At least one session-log directory (`.claude-logs/` for Claude Code, `.codex-logs/` for Codex) exists; each one present is not gitignored and is listed in `.prettierignore`, and at least one has something tracked (`.gitkeep`). | The transcript for the session that produced a change ships on the branch (`CLAUDE.md`), whichever agent wrote it. Transcripts are verbatim records, so the first one committed fails `format:check` unless Prettier is told to leave the directory alone. |

### Data layer

The template's stack conventions that can be locked structurally. For a repo
whose data still goes through Supabase they stay red until phase 7 of the
[playbook](#bringing-an-existing-repo-onto-the-standards) lands; that is the
to-do list, not a false positive.

| id                      | standard                                                                                                                                                                                                                                                    | why                                                                                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma-only-data-path` | The ESLint config in effect bans importing `@prisma/client` (type imports allowed) and every raw driver and ORM from `src/`, with `src/server/db/client.ts` the one exemption.                                                                              | One file constructs the client; everything else imports `db` from it. The legacy 8x repo shipped 147 RPC call sites TypeScript could not see, and a dropped column broke one in production (`docs/rules/database.md`).                                                              |
| `supabase-auth-only`    | The ESLint config bans importing `@supabase/*` outside `src/lib/supabase/` and `src/proxy.ts`; both wrappers return `AuthOnlySupabaseClient`, a `Pick` of the client's auth surface that exposes neither `from` nor `rpc`.                                  | A data call through Supabase is a type error, not a rule to remember. Widen the type for realtime deliberately, in one file; never to a data path (`docs/rules/auth.md`).                                                                                                           |
| `rls-check-wired`       | `scripts/check-rls.mjs` exists, `check:rls` runs it, and CI's migrations job runs it after `prisma migrate deploy`. The check itself reads `pg_class` and `pg_policy` on that database: every table has RLS enabled, no table has a policy, none is forced. | RLS is not in the Prisma schema, so the drift check cannot see it, and the SQL text is not what Postgres acts on. Enabled with no policies denies every row to the roles the Data API would use; FORCE would deny Prisma too. Exemptions live in `RLS_EXEMPT_TABLES`, with reasons. |

## Running it

```bash
pnpm check:standards                                    # this repo
node scripts/check-standards.mjs --root ../other-repo   # audit another checkout
node scripts/check-standards.mjs --json                 # machine-readable, for a dashboard
DATABASE_URL=postgresql://... pnpm check:rls            # the RLS check, against a database with the migrations applied
```

Exit `0` when every standard is met, `1` otherwise, with one line per
failure saying what is missing and, where it is not obvious, the command
that fixes it.

Two checks need `node_modules` — `eslint-effective-rules` and
`typescript-strict` run the installed tools to get the resolved config. An
uninstalled tool is reported as a failure, not skipped: a repo with no
linter has not met the standard. Three checks need the directory to be a
git repository, for the same reason.

## What it deliberately doesn't check

- **Conventions that need the code read.** Server/Client boundaries, magic
  numbers, the Rule of Three, ownership scoping inside a handler.
  `local-review`'s manual pass and the AI review own them. The data layer is
  the exception, because it can be locked without reading code — see the
  table above.
- **Who hand-wrote a migration.** CI replays every migration, diffs the
  result against the schema, and refuses destructive patterns; what it cannot
  tell is whether a file that applies cleanly was written by the generator or
  by a person. Two hand-written kinds are sanctioned (`docs/rules/migrations.md`),
  so an author check needs a policy decision first.
- **That the gates pass.** That is CI's other jobs. This checks that they
  _run_.
- **Anything that lives outside the repo.** Branch protection, GitHub
  secrets, the `production-database` environment, Vercel env vars —
  `docs/CI_CD_SETUP.md` is the checklist for those, and it is a human's.
- **Whether a rule is any good.** A rule file can exist, be linked, and be
  wrong. The check proves the scaffolding is wired, not that what it
  carries is true.

## Bringing an existing repo onto the standards

This is app-discovery's playbook, generalised. The phases are a real
dependency chain, not a tidy list: Prisma could not land there before phase
5, because rewriting every database call in a repo with no CI, no linter
and no tests means the rewrite arrives with nothing to catch it. The early
phases build the net; the refactors are the first things to fall into it.

0. **Audit, and mark what doesn't apply.** Run the check with `--root`
   against the repo; the failures are the list. Then decide which stack
   conventions apply, and write the divergences into that repo's
   `AGENTS.md` rather than leaving template rules standing as silent lies
   about the stack. Verify the audit's own claims before acting on them —
   two of app-discovery's findings were wrong (below).
1. **Untrack machine-local state** and fix the `.gitignore` patterns that
   missed it — nested `.vercel/`, CLI temp directories.
   _`no-machine-local-state-tracked`, `machine-local-state-ignored`._
2. **Find the generated artifacts.** Anything committed _and_ built by hand
   has drifted. Move it to build time and add a drift guard. This is
   repo-specific, so no check covers it — and it is where app-discovery's
   biggest bug hid: the deployed bundle was 35 commits behind `src/`, and
   production had spent an incident missing the very timeout hardening
   written to fix it.
3. **Env schema before anything else.** One file reads `process.env`; a
   check enforces schema ↔ `.env.example` ↔ code. _`env-schema`._
4. **Lint, then format, in that order** — so the formatting commit stays
   purely mechanical and reviewable as such. _`eslint-effective-rules`,
   `typescript-strict`, `prettier-config`._
5. **CI on pull requests.** Everything above is advisory until something
   runs it on a branch. _`ci-gates-every-pr`, `ci-commits-job`,
   `local-review-mirrors-ci`, `package-scripts`, `commit-msg-hook`,
   `hooks-path-installed`._
6. **Agent instructions**, written for _that_ stack, with the per-tool files
   importing rather than restating. _`agents-md`, `agents-md-links-resolve`,
   `rules-all-linked`, `rules-core-set`, `per-tool-entry-points`,
   `session-logs-tracked`._
7. **Then the large refactors**, one per PR, onto the net the earlier steps
   built. For a repo whose data goes through Supabase today, the three
   data-layer checks stay red until this phase lands — that is the list.

Copy `scripts/check-standards.mjs` into the repo as part of phase 5 and wire
`check:standards` into `package.json`, CI and `local-review`. From then on
the check guards the migration the same way it guards this template.

## What nearly went wrong

The transferable part of app-discovery's migration. Each of these cost real
time or nearly shipped a defect, and each shaped how the check above is
written.

**A text-scanning check can pass by matching nothing.** `check:env` scanned
the schema with a regex anchored to a literal tab. The Prettier commit
converted the file to spaces, so it matched zero variables — turning every
check below it into a no-op that still exited `0`. Any check that greps
source needs a "did I actually find anything?" assertion. Every scan in
`check-standards.mjs` has one.

**Piping a command hides its exit code.** Verifying gates with
`cmd | tail -1` reports _tail's_ status, not the command's. That is how the
broken check above slipped through a verification pass.

**Preview deploys catch what local gates cannot.** The `prepare` hook ran
`git config`, which exits 128 on Vercel because the build strips `.git` —
taking `npm install` and both deploys down. Seven local gates passed. Only a
real deploy found it, which is why `hooks-path-installed` accepts the
`|| exit 0`.

**Prove a reformat is inert, don't assert it.** An 8.6k-line formatting diff
is unreviewable by eye. Bundling before and after and comparing minified
output gives a byte-level guarantee across the whole dependency graph, in
seconds.

**Spike the risky integration before committing to it.** Prisma's default
configuration built cleanly in app-discovery's bundle and failed at runtime.
Finding that after rewriting 81 call sites would have been expensive. It
cost twenty minutes to find first.

**Verify the audit's own claims.** The audit reported six `any` usages —
there were zero; the grep's `any[]` pattern was matching `B2BCompany[]`. It
flagged RLS as a risk area — it was already complete and correct. Both would
have produced pointless work. An audit that only lists its hits is less
useful the second time.
