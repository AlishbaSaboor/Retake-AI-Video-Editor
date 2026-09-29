# CI/CD

Review the changes, fix what matters, push a PR, watch CI to green, address
review comments, and summarize.

This is the Codex-facing mirror of `.claude/commands/cicd.md`. The review
checklist, the fixes, and the guardrails are identical — keep the two in sync
when either changes. Only the tool conventions differ:

- Work in the current repo and preserve the user's uncommitted changes.
- Use `apply_patch` for edits and `rg` for search.
- Batch independent reads and searches in parallel where the runtime allows it.
- The shared rules live in `AGENTS.md` and `docs/rules/` — Codex loads
  `AGENTS.md` automatically; read the specific rule files the diff touches.
- Emit Codex git directives in the final response, only for actions that
  actually succeeded:
  - `::git-stage{cwd="/absolute/path"}`
  - `::git-commit{cwd="/absolute/path"}`
  - `::git-create-branch{cwd="/absolute/path" branch="branch-name"}`
  - `::git-push{cwd="/absolute/path" branch="branch-name"}`
  - `::git-create-pr{cwd="/absolute/path" branch="branch-name" url="https://..." isDraft=false}`

## Phase 1: Review the diff

1. `git fetch origin main && git diff origin/main --name-only`
2. For each changed file, read `git diff origin/main -- <file>` and look for:
   - **Blockers** — security holes, data loss, broken functionality, broken deploys.
   - **Major** — bugs, performance regressions, maintainability risks.
   - **Side effects and sanity** — what _else_ this change touches that isn't
     in the diff. A file can look clean in isolation and still break the
     system. For each of these where the answer is "possibly yes", _prove_
     it isn't a problem (grep, curl, read the other file) rather than
     assuming the diff is self-contained:
     - **Routing / proxy** — does this add a URL, asset path, file
       extension, or public prefix? `src/proxy.ts` handles locale routing
       and Supabase session refresh; verify its matcher covers (or
       correctly skips) the new path. A new `public/*` asset referenced
       from an anonymous page will redirect unless the proxy skips it.
     - **Prisma schema drift** — did the diff change `prisma/schema/**`?
       CI's migrations job generates the migration and commits it to the
       branch, so pull the bot's commit before reviewing and read the SQL
       it wrote — it's part of the diff you're reviewing. If that job went
       red, it refused a destructive diff (a rename emitted as `DROP` +
       `ADD`, a narrowed type, a new `NOT NULL`): that needs hand-written
       data-preserving SQL and is the owner's call. Flag it and stop.
     - **Schema / API contract** — does a field rename, enum change, or
       response-shape change have consumers elsewhere? Grep the old
       identifier across the repo, including the Zod schemas.
     - **Auth boundary** — does this path newly skip a session check, or
       read another user's rows without scoping by the session's user?
       Trace every entrypoint that can reach it (`docs/rules/auth.md`).
     - **Backfill on new columns** — a column added with a default that
       code immediately reads as meaningful is a silent correctness bug on
       first run.
     - **Cron / webhook** — did a schedule, secret, or payload shape
       change? Routes under `src/app/api/cron/**` check `CRON_SECRET`;
       verify the caller still matches.
     - **Deployed config** — new `process.env.X` references must be in
       `.env.example` _and_ `src/lib/env.ts` (`pnpm check:env` enforces
       this), and set in the relevant Vercel environments.
     - **Silent coupling** — does the diff rely on a file, table, bucket,
       or env var that exists today but isn't created by this diff? Will it
       still work for a teammate rebasing onto it?
   - **Dead code** — unused imports, unreferenced exports, orphaned files,
     commented-out blocks, unreachable branches, variables assigned but never
     read. Grep for remaining callers before deleting anything.
   - **Rule violations** — anything contradicting `AGENTS.md` or
     `docs/rules/`, especially:
     - Supabase used for data rather than auth only (`database.md`, `auth.md`)
     - hand-written migration SQL (`migrations.md`)
     - a raw error written into a response or UI instead of `AppError` /
       `captureError` (`error-handling.md`)
     - an API route with logic in `src/app/api/**/route.ts`, or without a Zod
       input schema — routes are thin `createApiRoute` / `createCronRoute`
       wiring, schema and handler live in `src/server/api/**` (`code-style.md`)
     - a new dependency where `src/components/ui/` already has the
       primitive (`components.md`)
     - `any`, god files, magic numbers (`code-quality.md`)
     - a global store for what belongs in URL params or TanStack Query
       (`state-management.md`)
     - Client Component boundaries wider than they need to be; request
       waterfalls; duplicate count/aggregate queries; barrel imports from
       large packages; eager loading of what isn't needed on first render
     - derived state in effects, or expensive work repeated per render
     - non-Conventional-Commits messages (the shared hook and CI both
       reject them)
     - AI slop: unnecessary comments, excessive try/catch, `as any`
   - **Minor** — style, naming, small cleanups.
3. Present findings grouped by severity before editing, if anything
   non-trivial turned up.

## Phase 2: Fix what matters

4. Fix every **Blocker**, **Major**, and rule violation.
5. Remove confirmed dead code; flag rather than delete when unsure.
6. Fix **Minor** issues only when they're quick wins that don't broaden the
   change. Skip purely stylistic suggestions that don't violate a project rule.
7. Run every CI gate locally before committing — `pnpm lint`, `pnpm typecheck`,
   `pnpm format:check`, `pnpm check:env`, `pnpm check:standards`, `pnpm test`,
   `pnpm build`, and `pnpm check:rls` against a local database with the
   migrations applied.
   `format:check` is the easiest to forget and fails CI on its own. If
   `prisma/schema/**` changed, `pnpm prisma generate` first.
8. Commit with a Conventional Commits message
   (e.g. `fix: resolve N+1 query in the project list handler`).

## Phase 3: Push and open the PR

9. `gh pr view --json number 2>/dev/null` to check whether a PR exists.
   - **Exists** — `git push`, then update the description if the risk
     profile changed.
   - **Doesn't** — `git push -u origin HEAD`, then `gh pr create`.
   - **Never** pass `--draft` unless the user asked for a draft.
10. Stage `.claude-logs/` before pushing, separately from the code commit
    (see `CLAUDE.md`).
11. Write the title and description **now** — at the end, once the work is
    actually done, per `docs/rules/pull-requests.md`. Conventional Commits
    style title; body covers the change, the tests run, and the review
    findings fixed.
12. **Screenshots for UI changes are mandatory.** If the diff touches a page,
    React component, layout, or styling, the PR body must include screenshots
    of the changed UI. Capture them by actually running the app (`pnpm dev` +
    a browser, or the `e2e-review` / `preview-acceptance-testing` skills).
    Before/after pair for a change to existing UI; new screens plus key states
    (empty, populated, error) for new UI.
    - Use image Markdown or an `<img>` tag, never a plain link — plain links
      don't render inline.
    - Prefer commit-pinned blob URLs with `?raw=1` so branch names with
      slashes don't break rendering:
      `https://github.com/<owner>/<repo>/blob/<sha>/path/to.png?raw=1`
    - Keep the images out of the source tree — push them to an out-of-PR
      archive branch (see `preview-acceptance-testing` step 6c) and link from
      the body.
    - Non-UI change? Say "no UI changes" in the body instead.
13. **Every PR description ends with a `## Production Watch List`.** Read the
    actual diff to write it — don't infer from commit messages. Categorize as
    High / Medium / Low by blast radius and reversibility. Focus on
    migrations, auth/session, cron jobs, API behavior changes, and UI flows
    that lost a confirmation step. For each: what could go wrong, and what to
    monitor. Skip pure styling and docs. If genuinely zero-risk:
    `No production risks — docs-only change.`

## Phase 4: Watch CI

14. `gh pr checks <number> --watch`
15. On failure: `gh run view <run-id> --log-failed`, fix, commit, push, watch
    again. Up to three attempts; then stop and report.

## Phase 5: Address review comments

16. `gh api repos/{owner}/{repo}/pulls/{number}/comments` and
    `gh pr view --json comments,reviews`.
17. For each: summarize what's asked, read the relevant code, make the fix if
    it needs one, note why if already addressed, and flag it rather than
    guessing if it's ambiguous or looks like over-engineering.
18. Commit and push the fixes, then resolve the threads you actually
    addressed. Never resolve a thread you didn't.

## Phase 6: Summary

```md
## CI/CD Complete

### PR: #<number> <url>

### Review Findings

- **Blockers fixed**: <list or "none">
- **Major issues fixed**: <list or "none">
- **Minor issues fixed**: <list or "skipped">

### CI/CD

- **Status**: passed / failed after N attempts / not run
- **Failures fixed**: <list or "none">

### PR Comments Addressed

- <comment and what was done>

### Commits Made

- `<hash>` <message>

### Files Changed

- `<file>`: <brief description>
```

## Guardrails

- **Never merge a PR** without explicit user approval.
- Never read or print `.env*` values.
- Never `git reset --hard` or `git checkout --` unless explicitly asked.
- Never revert unrelated user changes — leave dirty files that aren't yours
  alone.
- Never hand-write a migration; CI generates them from the schema diff.
  One-off SQL (a data fix, reference rows, a view) goes in
  `prisma/run-once.sql` instead — it runs once per database on the next
  deploy.
- Never create or update a PR for a UI change without screenshot evidence.
- If the branch has no changes against `main`, say so and stop.
