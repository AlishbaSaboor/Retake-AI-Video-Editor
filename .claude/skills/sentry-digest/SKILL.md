---
name: sentry-digest
description: Pull the last week of production errors from Sentry and generate a blameless error-review report — grouped by issue, attributed to the code path and PR author, with a prioritized fix list. Use when the user says "/sentry-digest", wants a weekly error report or postmortem, asks "what's erroring in prod", "who's causing the errors", or wants the production error backlog triaged. Publishes the report as an Artifact.
---

# Sentry digest — weekly production error review

Sweep the errors piling up in production, work out what each one actually is,
whose code path produces it, and turn that into a consistent review report.

Errors reach Sentry through `captureError` / `captureClientError`
(`src/lib/observability/`) — the single reporting path this repo allows
(`docs/rules/error-handling.md`). That matters for triage: **`AppError` and
other expected failures are deliberately never sent**, so anything in Sentry
is by definition unexpected. There is no "that's just a validation error"
bucket to dismiss.

## Usage

```
/sentry-digest          # last 7 days
/sentry-digest 3        # last 3 days
```

## 1. Pull the data

Use the Sentry MCP. Resolve the org and project first rather than assuming —
`SENTRY_ORG` and `SENTRY_PROJECT` in `.env.example` name the variables, but
read the values from the configured MCP connection, not from a `.env` file on
disk.

For the window, collect per issue:

- title / culprit / error type
- event count and user count
- first seen, last seen (a spike inside the window matters more than a total)
- environment (filter to production; note anything you excluded)
- release / commit if releases are wired up
- the top stack frame that belongs to this repo, not to `node_modules`

If the org has Seer available, run its analysis on the top few issues — it
often names the offending line directly and saves a manual trace.

**Retention caveat — state it in the report.** Sentry retention and quota
drops mean a 7-day request can return less than a true week, and high-volume
issues can be rate-limited into undercounting. Report the window you actually
got; don't claim "the whole week" if the numbers say otherwise.

## 2. Bucket every issue

This is what separates a shipped bug from noise:

- **Shipped bug** — thrown from this repo's own code. Worth fixing. These are
  the report's findings.
- **Infrastructure / dependency** — connection resets, upstream 5xx, Prisma
  pool exhaustion, cold-start timeouts. Real, but the fix is configuration or
  capacity, not a line of code.
- **Noise** — bot traffic, extension-injected client errors, cancelled
  navigations, `ResizeObserver loop` warnings, requests to routes that don't
  exist. No action; group them into one card.

## 3. Recognise the recurring shapes

The classes that show up most in a Next.js + Prisma app on Vercel:

| Shape                                   | Typical cause here                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `PrismaClientKnownRequestError` `P2002` | unique constraint hit by a plain `create` where an idempotent `upsert` was needed                                     |
| `P2003`                                 | writing a child row before its parent exists                                                                          |
| `P2025`                                 | `update`/`delete` on a row a concurrent request already removed                                                       |
| `P1001` / `P2024`                       | pooler exhausted — check `DATABASE_URL` is the pooled (6543) connection, per `.env.example`                           |
| `ZodError` escaping to Sentry           | a schema mismatch at an API boundary that should have been an `AppError` — see `docs/rules/error-handling.md`         |
| `Dynamic server usage`                  | a Server Component reading `cookies()`/`headers()` under a `'use cache'` boundary                                     |
| Hydration mismatch                      | server and client rendering different markup — usually a date, a random value, or a `localStorage` read during render |
| Unhandled rejection in a route handler  | an `await` missing on a fire-and-forget call                                                                          |
| `MissingEnvError` from `src/lib/env.ts` | a variable set locally but absent from that Vercel environment's scope                                                |

Extend the table as the project's real error profile emerges.

## 4. Attribute each shipped bug

For each meaningful issue:

1. Take the top in-repo stack frame (`file:line`).
2. Confirm the code path still exists and still looks like the reported
   frame — source maps can point at a line the branch has since moved.
3. Attribute the author:
   ```bash
   git log --diff-filter=A --format="%an | %ad | %h | %s" --date=short -- <file> | tail -1
   git blame -L <line>,<line> -- <file>
   ```
   Quote paths containing `[brackets]` so zsh doesn't glob them.
4. When the commit subject carries a PR number, `gh pr view <num> --json author,title,mergedBy` — **PR author beats commit author**.
5. Check whether a fix already exists but hasn't shipped:
   `git log --all --oneline -- <file>` looking for a `fix:` commit. If so,
   mark it _fixed on branch, pending deploy_ and name who fixed it.

Keep confidence honest: line-level blame for a clean defect, feature-ownership
for the tail. Say which, in an "owner ≠ blame" note.

## 5. Roll up

Sum shipped-bug event counts per owner. Compute each finding's share of total
events. Rank the fix list by **events × user impact ÷ effort**, not raw count
— a low-volume issue that breaks checkout for everyone who hits it outranks a
noisy log line.

## 6. Publish

Assemble the report and publish it with the **Artifact** tool. Load the
`artifact-design` skill first, as always. Structure:

- a stat band — total events, distinct issues, users affected, window actually
  covered
- a headline callout — the single highest-leverage fix
- error volume by owner
- one finding card per meaningful issue: root cause, file, owner, PR, fix
- a prioritized "what to do next" table
- a method footer stating the window, the retention caveat, and how
  attribution was determined

**Escape captured text before it goes into HTML.** Stack frames and error
messages come from production and can contain `<`, `>`, `&`. Escape them, and
redact anything user-identifying (emails, tokens, ids) before it lands in a
shareable page.

Then give the user the Artifact URL and a three-line chat summary: total
errors, the top one or two issues, and the single highest-leverage fix.

## Tone

Blameless but honest. The goal is killing the top sources; owners are named so
the right person picks each one up. Factual, no filler. If one person owns
most of the volume, say so plainly and constructively. **Never invent a
count** — every number comes from Sentry or from `git`.

## Safety

- Read-only. Never mutate or resolve issues as a side effect of generating a
  report.
- Never print or paste an auth token; never read `.env*` or `~/.pgpass`.
- The Artifact is private by default — remind the user it's shareable before
  they circulate it, since it names people.
