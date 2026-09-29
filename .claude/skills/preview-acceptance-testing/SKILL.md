---
name: preview-acceptance-testing
description: Self-directing acceptance-test loop against a PR's live Vercel preview deployment. Resolves the preview URL, waits for the deploy to be READY for HEAD, seeds what the changed flows need, drives a browser through them, branches on failures, runs a completeness critic, and publishes a screenshot report plus a PR comment. Use when preparing to merge a PR, or when the user says "/preview-acceptance-testing", "test this on preview", "preview QA", "acceptance test the PR", or "QA the preview deploy".
---

# Preview acceptance testing

The preview-environment sibling of `local-feature-testing` and `e2e-review`.
It runs a self-driving QA loop against the PR's **live Vercel preview
deployment** — the exact build a reviewer will click through. It reads the
branch diff to decide what to test, sets itself up, drives the browser, digs
into every failure, asks what it hasn't covered yet, and stops when coverage
is dry or a budget is hit. Then it publishes a screenshot report and one PR
comment.

Nothing in this skill is hardcoded to a particular project — every URL,
database, and credential is resolved at run time from the repo's own git
remote, `gh`, and the Vercel CLI.

## Modes

```
/preview-acceptance-testing          # auto (default)
/preview-acceptance-testing auto
/preview-acceptance-testing manual
```

- **`auto`** — drive the browser, observe, branch, screenshot, report.
- **`manual`** — produce the plan, preview URL, sign-in instructions and any
  seed SQL, hand it to the user, stop.

## When not to use it

- **Pre-push, on your own machine** — `local-feature-testing` (faster, no
  deploy wait).
- **Running the automated suite** — `e2e-review` / `pnpm test:e2e`.
- **Purely mechanical checks** — `local-review`.

## Prerequisites this skill does not create

Check these at the start and degrade gracefully rather than failing:

| Need                               | How to check                                 | If missing                                                                                                                                 |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| An open PR with a Vercel preview   | `gh pr view --json number,statusCheckRollup` | Stop; tell the user to push and open a PR first.                                                                                           |
| Vercel CLI authed to the project   | `vercel whoami` and `vercel project ls`      | Use the Vercel check's `targetUrl` from `gh` (step 2a) and skip anything needing the CLI — including the preview DB, so Tier 2 is blocked. |
| A way to reach authenticated pages | see **Authentication** below                 | Test only the public surface, and say so explicitly in the report.                                                                         |
| A reachable preview database       | see step 2b                                  | Run read-only/display flows, mark write flows _blocked-pending-seed_.                                                                      |

### Authentication

This template ships Supabase Auth (`docs/rules/auth.md`) and **no test sign-in
bypass** — a fresh clone has no way for an agent to authenticate against a
preview deploy. So, in order of preference:

1. **A project-provided test-auth path.** If the project has added one (a
   `/api/dev/session`-style route behind a secret, a seeded magic link, a
   Playwright `storageState` fixture), use it. Look for it before assuming
   there isn't one: `rg -l 'storageState|dev/session|DEV_.*SECRET' e2e src`.
2. **Supabase magic link.** If the preview points at a database you can
   reach, mint a link with the service-role key against that project's auth
   admin API and navigate to it.
3. **Public surface only.** Test what an anonymous visitor sees, and open the
   report with a line stating that authenticated flows were not covered and
   why.

Never read secrets out of `.env*` on disk (`docs/rules/*` and this repo's
`.gitignore` both treat those as off limits), and never print a resolved
connection string or token — `.claude-logs/` is committed.

## The loop

```
Step 0  Init artifact folder                (auto only)
Step 1  Scope     — diff → tiered plan
Step 2  Set up    — preview URL (wait READY) + DB + seed + auth
Step 3  Round     — drive the happy paths, screenshot every meaningful state
Step 4  Branch    — every failure reproduces-and-classifies; every pass asks
                    "what adjacent flow is now at risk?"
Step 5  Critic    — re-read the diff: what changed file/route/role/state is
                    still unexercised? Its output seeds the next round.
Step 6  Stop      — critic dry OR budget hit → report + PR comment
```

### Step 0 — Artifact folder (auto mode)

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD | tr '/' '-')
RUN_TS=$(date +%Y%m%d-%H%M%S)
ARTIFACT_DIR=".test-screenshots/preview-${BRANCH}-${RUN_TS}"
mkdir -p "$ARTIFACT_DIR"
grep -qxF '.test-screenshots/' .gitignore || echo '.test-screenshots/' >> .gitignore
echo "Artifacts → $ARTIFACT_DIR"
```

Bash calls are stateless, so re-derive or hard-code the same path in later
calls. The folder also receives `REPORT.md` in step 6.

### Step 1 — Scope: diff → tiered plan

```bash
git fetch origin main
git log origin/main..HEAD --oneline
git diff origin/main...HEAD -- ':(exclude).claude-logs'
```

Identify changed routes and pages, schema changes under `prisma/schema/`,
roles touched, and side effects (DB writes, Slack alerts via `captureError`,
cron routes, PostHog events). Then split the plan into two tiers — this is
what lets the run degrade instead of failing:

- **Tier 1 — runs on whatever data the preview already has.** Display and read
  flows. These run with no seeding.
- **Tier 2 — needs seeded preconditions.** Write and multi-step flows. If the
  preview DB resolves, seed them; if not, emit a paste-ready seed block and
  mark them _blocked-pending-seed_ rather than failing them.

Write each item as **What / How / Pass criteria**, tagged `[T1]` or `[T2]`.
Cover only categories the diff actually touches. Output the checklist before
doing anything; keep it to roughly eight items per round.

### Step 2 — Set up

#### 2a. Resolve the preview URL and wait for READY

A push triggers an async build, so confirm the deploy is READY **for the
current HEAD SHA** or you'll test a stale bundle.

```bash
gh pr view --json statusCheckRollup -q \
  '.statusCheckRollup[] | select((.context // .name) | test("[Vv]ercel|[Pp]review|[Dd]eploy")) |
   {name: (.context // .name), state: (.state // .conclusion), url: (.targetUrl // .detailsUrl)}'
```

Prefer the check's `targetUrl` — it is the exact deployment for that commit.
Only if there is no such check, ask the Vercel CLI for the linked project's
recent deployments and pick the one whose commit matches HEAD:

```bash
vercel ls 2>/dev/null | head -20
vercel inspect "<deployment-url-from-above>" 2>&1 | head -30   # confirm commit + state
```

Match on the commit SHA, not on the branch name — a branch with two pushes has
two deployments and only the newer one is the build under review. Never
hand-construct a `*.vercel.app` alias from the branch name; alias formats vary
by team and project and a guessed URL silently resolves to someone else's
deploy or a 404.

Poll a handful of times a few seconds apart if it's still building. Then
sanity-check before driving anything:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$PREVIEW_URL"
```

#### 2b. Resolve the preview database (never print the URL)

Preview deploys read whatever `DATABASE_URL` is set in the Vercel Preview
scope. Resolve it fresh each run — branch databases rotate credentials.

> **`vercel env pull` overwrites `.env.local` by default.** Never run it
> without an explicit output path; clobbering the user's local env file is a
> destructive side effect that has nothing to do with this skill. Always pull
> to a temp file you delete, as below.

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
ENVFILE=$(mktemp) && trap 'rm -f "$ENVFILE"' EXIT
vercel env pull "$ENVFILE" --environment=preview --git-branch="$BRANCH" --yes >/dev/null 2>&1
URL=$(sed -n 's/^DATABASE_URL=//p' "$ENVFILE" | tr -d '"')
rm -f "$ENVFILE"

if [ -z "$URL" ]; then
  echo "Preview DB not resolvable — Tier 2 items will be blocked-pending-seed."
else
  psql "$URL" -v ON_ERROR_STOP=1 -c "<QUERY>"   # URL stays in the variable, never echoed
fi
```

Note `DATABASE_URL` is the **pooled** connection (port 6543, per
`.env.example`), which is right for queries. If you need a session-mode
connection for DDL, that is `DIRECT_URL` — and schema changes belong to
`staging-migration`, not to this skill.

**Credential rules (mandatory, same as `sql-preview`):** never echo `$URL`;
never write a literal `postgresql://…` into a command; never read `.env*` or
`~/.pgpass`; never leave the pulled env file on disk; connect only to the
preview target, never staging or production.

If the branch changed `prisma/schema/`, the preview database may be missing
this branch's columns — that's what `staging-migration` is for. Run it (or
say the flows are blocked on it) rather than hand-writing DDL.

#### 2c. Seed Tier 2, or hand off

If 2b resolved, seed the minimum the Tier-2 items need, following
`seed-for-pr`: use the app's own Prisma client rather than raw SQL where
possible, one transaction, stable identifiers (`seed-for-pr-…`) with upserts
so re-runs are idempotent.

If it didn't resolve, emit a ready-to-paste idempotent seed block and mark
those items blocked.

### Step 3 — Round (auto mode)

Authenticate per the **Authentication** table above, then for each plan item:

- snapshot before acting, to read refs and current state
- click / fill / type to interact
- screenshot **after** every meaningful UI change
- scan console and network output for 4xx/5xx and JS errors

**Screenshot naming.** The filename is the annotation — sequential,
zero-padded, kebab-cased, self-describing, all inside `$ARTIFACT_DIR`:

```
01-signin-redirects-to-dashboard.png
02-projects-list-baseline-data.png
03-new-status-filter-shows-counts.png
04-empty-state-no-results.png
```

Capture at minimum: the post-auth landing, each page's initial state, every
transition you assert on, and every error/empty state. Keep a running
screenshot → plan-item map for the report.

Verify side effects in the preview DB when it resolved (records created, no
orphans or duplicates, correct status transitions).

### Step 4 — Observe and branch

This is what makes the loop self-directing — don't just march the checklist.

- **Every failure or surprise** spawns a reproduce-and-classify step: re-run
  the action to confirm it's real, read the relevant source to find the cause,
  bucket it, and capture evidence.
- **Every pass** asks: _what adjacent flow did this change put at risk that I
  haven't hit yet?_ Add the worthwhile ones to the round.

### Step 5 — Completeness critic

Before ending a round, re-read the diff: **what changed file, route, role,
table, or state have I not exercised?** A non-empty list becomes the next
round's plan. This catches the long tail a one-pass checklist misses.

### Step 6 — Stop and publish

Stop when the critic comes back dry, or the budget is hit. Default budget:
about four rounds or twenty minutes, whichever comes first. State the budget
when you start, and say which condition stopped you.

**6a. Write `REPORT.md`** in `$ARTIFACT_DIR`, one row per screenshot, leading
with branch, timestamp, preview URL, auth coverage, and stop condition:

```markdown
# Preview acceptance run — <branch> — <ISO timestamp>

Preview: <PREVIEW_URL> · Stopped: critic dry / budget hit
Auth: full / public-surface-only (<reason>) · Tier 2: seeded / blocked-pending-seed

| #   | Tier | Test                                     | Result | Screenshot                                                |
| --- | ---- | ---------------------------------------- | ------ | --------------------------------------------------------- |
| 1   | T1   | Home renders for an anonymous visitor    | PASS   | [![](01-home-anonymous.png)](01-home-anonymous.png)       |
| 2   | T2   | New status filter returns correct counts | FAIL   | [![](03-new-status-filter.png)](03-new-status-filter.png) |
```

The `[![](x.png)](x.png)` pattern renders an inline thumbnail that also links
to the full image.

**6b. Open the folder** so the user can flip through it:

```bash
command -v open >/dev/null && open "$ARTIFACT_DIR" || \
  { command -v xdg-open >/dev/null && xdg-open "$ARTIFACT_DIR"; }
```

**6c. Post one PR comment.** GitHub proxies inline comment images through
camo, which can't authenticate to `raw.githubusercontent.com` on a **private**
repo — embedded images render broken. Push the screenshots to an out-of-PR
archive branch and link its `REPORT.md` blob view instead, which inherits the
viewer's session auth:

```bash
PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null || echo "")
PNG_COUNT=$(find "$ARTIFACT_DIR" -maxdepth 1 -name '*.png' | wc -l | tr -d ' ')
if [ -n "$PR_NUMBER" ] && [ "$PNG_COUNT" -gt 0 ]; then
  SCREENSHOT_BRANCH="_screenshots/PR-${PR_NUMBER}-${RUN_TS}"
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
  WORK=$(mktemp -d)
  git -C "$WORK" init -q
  git -C "$WORK" checkout --orphan "$SCREENSHOT_BRANCH" -q
  find "$ARTIFACT_DIR" -maxdepth 1 -name '*.png' -exec cp {} "$WORK"/ \;
  cp "$ARTIFACT_DIR/REPORT.md" "$WORK"/
  git -C "$WORK" add -A
  git -C "$WORK" -c user.email=bot@local -c user.name=preview-acceptance-testing \
    commit -q -m "screenshots: PR #${PR_NUMBER} preview run ${RUN_TS}"
  git -C "$WORK" remote add origin "$(git remote get-url origin)"
  git -C "$WORK" push -q origin "$SCREENSHOT_BRANCH"
  rm -rf "$WORK"

  {
    echo '<details>'
    echo "<summary><strong>Preview acceptance run</strong> — ${RUN_TS} — <a href=\"https://github.com/${REPO}/blob/${SCREENSHOT_BRANCH}/REPORT.md\">full report with screenshots</a></summary>"
    echo
    cat "$ARTIFACT_DIR/REPORT.md"
    echo
    echo "Archive branch: \`${SCREENSHOT_BRANCH}\`"
    echo '</details>'
  } > "$ARTIFACT_DIR/PR_COMMENT.md"

  gh pr comment "$PR_NUMBER" --body-file "$ARTIFACT_DIR/PR_COMMENT.md"
fi
```

**6d. Tell the user** the artifact path, the comment URL, anything left
blocked-pending-seed (with the handoff SQL), and that the local screenshot
folder is gitignored and stays on disk.

### Manual mode

Produce one hand-off block and stop — no browser, no seeding:

````markdown
## Preview acceptance hand-off — <branch>

### Preview deploy

<PREVIEW_URL> (confirm the Vercel check is SUCCESS for HEAD first)

### Sign in

<instructions or link, per the Authentication table>

### Tiered plan

**Tier 1 — runs on existing data**

- [ ] <what / how / pass criteria>

**Tier 2 — needs seeded data**

- [ ] <what / how / pass criteria>

### Tier-2 seed

```sql
<idempotent seed SQL>
```

### What to watch for

- <preview-specific risk: a var missing from the Preview scope, a migration
  the preview DB doesn't have yet, build readiness>
````

## Reporting findings

1. **Blocker** — broken or unreachable (crash, missing preview env var, deploy
   never went READY).
2. **Bug** — works partially, clear defect.
3. **UX issue** — works, but the experience is poor.
4. **Observation** — minor or cosmetic.

Each one needs: the screenshot filename, steps to reproduce, expected vs
actual, and the root cause if you could identify it from the source.

## Common gotchas

| Gotcha                                   | Fix                                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Testing a stale build                    | Wait for the Vercel check to be SUCCESS **for HEAD**, not just green from an earlier push (step 2a).                                    |
| Preview DB missing this branch's columns | The branch changed `prisma/schema/` — run `staging-migration`, don't hand-write DDL.                                                    |
| Preview credentials changed mid-run      | They rotate on branch recreation. Always resolve fresh; never cache.                                                                    |
| A var works locally but 500s on preview  | It's in `.env.local` but not the Vercel **Preview** scope. `src/lib/env.ts` validates at boot, so the error message names the variable. |
| Every route redirects                    | `src/proxy.ts` handles locale routing and session refresh — preview URLs redirect to `/<locale>/…`. Include the locale prefix.          |
| Authenticated pages all 401              | Expected on a fresh clone with no test-auth path. Cover the public surface and say so; don't fake a pass.                               |
