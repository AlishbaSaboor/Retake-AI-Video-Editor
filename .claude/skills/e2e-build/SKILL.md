---
name: e2e-build
description: Drive an already-approved implementation plan all the way to a merge-ready PR using both Codex and Claude. Hands the plan to Codex to implement, then has Claude review, locally test, type-tighten, and run CI/CD to open the PR, then spins Codex up again for a final PR review and fix pass. Use when the user says "/e2e-build", "ship this plan", "build this end to end", "run e2e build", or has an approved plan ready and wants it implemented, tested, and PR'd without driving each step by hand. Do NOT use this to write the plan itself — the plan must already exist and be approved.
---

# E2E build

Turn an approved plan into a merge-ready PR by orchestrating Codex and Claude
across fixed roles. This is the automation that runs _after_ you and the user
have agreed on a plan. It does not gather requirements or write the plan.

## Roles

| Phase                  | Agent      | What happens                                                                                                                         |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Implement           | **Codex**  | Implements the whole plan on the current branch                                                                                      |
| 2. Review + local test | **Claude** | Quick diff review, then `local-feature-testing` and `e2e-review` (gate)                                                              |
| 3. Tighten + ship      | **Claude** | `typesafe`, `local-review`, then `/cicd` opens the PR and gets it green, then `preview-acceptance-testing` gates on the live preview |
| 4. Final PR review     | **Codex**  | Reviews the PR, fixes findings, reruns `/cicd`                                                                                       |
| 5. Report              | **Claude** | Summarize, leave the PR merge-ready (never merge)                                                                                    |

You are running **in Claude**, so you orchestrate: run the Claude phases
yourself, shell out to `codex exec` for the Codex phases, and wait for each to
finish before moving on.

## Prerequisites

> **Autonomy warning — surface this before you start.** This pipeline runs
> Codex and Claude fully autonomously with no approval prompts. Only run it on
> a trusted machine, against a reviewed plan, on a feature branch.

- **Codex is installed and authed** — `command -v codex`. If not, stop and say
  so; there is no Claude-only fallback for this skill (use `/cicd` directly).
- **An approved plan exists.** Use the file path or inline plan the user
  passed as an argument, otherwise the plan you just agreed on in this
  conversation. If you can't identify a clear, approved plan, **stop and ask**.
  Do not invent one.
- **You are on a feature branch, not `main`.** If on `main`, stop and tell the
  user to branch first.

## Phase 0 — Capture the plan

Codex runs as a separate process with **zero memory of this conversation**, so
the plan file has to stand alone.

```bash
mkdir -p .e2e-build
grep -qxF '.e2e-build/' .git/info/exclude 2>/dev/null || echo '.e2e-build/' >> .git/info/exclude
```

Write the full plan to `.e2e-build/plan.md`: what to build, which files and
areas, the approach, edge cases, and every gotcha already discussed. A reader
with no other context must be able to implement it. Include any code snippets
that were agreed on.

Tell the user: "Captured the plan, handing it to Codex to implement."

## Phase 1 — Codex implements

Launch Codex non-interactively and **in the background** — a full
implementation runs well past the foreground Bash timeout.

```bash
codex exec \
  --dangerously-bypass-approvals-and-sandbox \
  -C "$(git rev-parse --show-toplevel)" \
  --output-last-message .e2e-build/codex-implement-result.txt \
  "$(cat <<'PROMPT'
You are implementing an approved plan in this repository, on the current git branch.

Read AGENTS.md at the repo root first, and every docs/rules/*.md file that the
plan touches, and follow them strictly — database access, migrations, auth,
state management, error handling, components, code style, code quality.

The full plan is in .e2e-build/plan.md. Read it and implement ALL of it. Do not
stop halfway.

Rules:
- Stay on the current branch. Do NOT create a branch, push, or open a PR.
- Commit your finished work with a Conventional Commits message so the branch
  diff against main is real. Do not push.
- Run `pnpm lint`, `pnpm typecheck` and `pnpm build` for what you touched and
  fix what you break. If you changed prisma/schema/**, run `pnpm prisma
  generate` first, and do NOT hand-write a migration — CI generates it.
- If you hit a blocker needing a human decision, stop and explain it clearly
  instead of guessing.
- End your final message with exactly one of:
  E2E_IMPLEMENT_STATUS: DONE
  E2E_IMPLEMENT_STATUS: BLOCKED — <reason>
PROMPT
)" \
  > .e2e-build/codex-implement.log 2>&1
```

Run it with `run_in_background: true`, then **wait for it to exit**. Do not
start Phase 2 until it has.

When it exits, check in this order and **halt the pipeline** on any failure
(show the log tail, hand back to the user):

- non-zero exit, or `.e2e-build/codex-implement-result.txt` missing/empty —
  Codex crashed; a hard failure even with no sentinel written.
- result ends `E2E_IMPLEMENT_STATUS: BLOCKED` — show the reason.
- result ends `DONE` — confirm with `git log --oneline -5` and `git status`
  that the implementation actually landed, then continue.

## Phase 2 — Claude review + local test (gate)

1. **Quick diff review.** Read `git diff origin/main...HEAD` (`origin/main`,
   not local `main`, which lags) for correctness bugs, auth-boundary problems,
   rule violations, and anything contradicting the plan. Fix small,
   clearly-correct issues inline and commit. Keep it light — Phase 4 is the
   deep review.
2. **Run `local-feature-testing`** to exercise the feature against a real
   running app.
3. **Run `e2e-review`** if the change is user-facing, to run the Playwright
   specs and flag flows the diff added without coverage.
4. **Gate.** Continue only if both are genuinely positive. If they surface
   real bugs: fix the straightforward ones, commit, re-test. If they're
   substantial or ambiguous, **stop** and report with the evidence. Do not
   push a broken feature into a PR.

## Phase 3 — Tighten and ship

1. **Run `typesafe`** to remove trivial type assertions the branch introduced
   and flag the non-trivial ones.
2. **Run `local-review`** — the full local gate (lint, typecheck, format,
   env-var check, unit tests, build) plus the manual rules pass. This is the
   step that keeps CI cheap, per `docs/rules/commits.md`; do not skip it.
3. **Run `/cicd`** to commit, push, open or update the PR with the description
   and Production Watch List, watch CI to green, and address review comments.
   Per `docs/rules/pull-requests.md`, the title and description get written
   here — at the end, when the work is actually done.
4. **Run `preview-acceptance-testing`** as the post-push gate, once the
   Vercel preview is READY. Treat it like the Phase 2 gate: fix straightforward
   failures, commit, re-run; **stop** and report on anything substantial.
5. Capture the PR number and URL for Phase 4.

## Phase 4 — Codex final PR review

```bash
codex exec \
  --dangerously-bypass-approvals-and-sandbox \
  -C "$(git rev-parse --show-toplevel)" \
  --output-last-message .e2e-build/codex-review-result.txt \
  "$(cat <<'PROMPT'
Read AGENTS.md and the docs/rules/*.md files relevant to this diff, and follow
them strictly.

A PR is open for the current branch. Do a thorough review of this branch
against origin/main — run `codex review --base origin/main`. Then:
- Fix every real issue you find. Keep edits scoped to the diff; do not
  refactor unrelated code.
- Use the repo's /cicd command to commit, push, update the PR, watch CI back to
  green, and address any new review comments.
- Do NOT merge the PR.
- If you find nothing worth changing, say so explicitly.
End your final message with exactly one of:
  E2E_REVIEW_STATUS: DONE
  E2E_REVIEW_STATUS: BLOCKED — <reason>
PROMPT
)" \
  > .e2e-build/codex-review.log 2>&1
```

Background it, wait for exit, read the result file. `BLOCKED` → surface the
reason. `DONE` → confirm CI is still green with `gh pr checks`.

## Phase 5 — Report and stop

Summarize:

- PR number and URL, and that it is **merge-ready** (CI green, both review
  passes done).
- What Codex implemented; what local and preview testing covered (link the
  screenshot artifacts); what `typesafe` and `local-review` changed; what the
  final Codex review found and fixed.
- Any open questions or risks.

**Never merge the PR.** End by telling the user it's ready for their review.

## Failure handling

- Any phase that ends `BLOCKED`, errors, or fails its gate **halts the
  pipeline**. Report and hand back; never push past a red gate.
- A Codex run with no progress past a reasonable wall-clock: show the log tail
  and ask whether to wait or abort.
- Per-phase artifacts stay in `.e2e-build/` (logs + last-message files) so the
  user can inspect any step. It's excluded locally via `.git/info/exclude`.

## Notes

- `--dangerously-bypass-approvals-and-sandbox` runs Codex fully autonomously.
  That is intentional for a hands-off pipeline on a trusted machine, and the
  reason for the warning above.
- This repo has an `AGENTS.md`, so Codex picks up the shared rules
  automatically — the explicit "read AGENTS.md" line in each prompt is belt and
  braces, and it's what points Codex at the specific `docs/rules/` files.
- Remember to stage `.claude-logs/` before the push, per `CLAUDE.md`.
