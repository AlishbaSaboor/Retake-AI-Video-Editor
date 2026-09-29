@AGENTS.md

Everything above applies to any coding agent working in this repo (Claude,
Codex, Cursor, Qwen, whatever) — it lives in `AGENTS.md`, not here, on
purpose, since `AGENTS.md` is the file every tool reads and `QWEN.md` is
Qwen-Code-only. Don't duplicate rules back into this file; add them to
`AGENTS.md` so they reach every tool, not just this one.

This file holds the things that genuinely are Qwen-Code-specific.

## Session logs

`.claude-logs/` is tracked, not gitignored — the transcript for the session
that produced a change belongs on the branch that ships it. Claude Code
writes those transcripts automatically; Qwen Code does not, so there is
usually nothing to stage from a Qwen Code session. If you do save a transcript
or a working log, put it in `.claude-logs/` with the same
`YYYY-MM-DD_HH-MM-SS_<id>.md` naming, and stage it immediately before
`git push`, separately from the code commit.

## Workflows (the "skills")

Qwen Code has no skills mechanism, but the workflows are written as plain
Markdown and are worth following by hand. Each one lives at
`.claude/skills/<name>/SKILL.md` — read the file and execute its steps
yourself rather than improvising your own version.

**Setup, once**

- `template-setup` — run once, right after creating a new repo from this
  template.
- `dev-onboarding` — run once per developer, getting a local environment
  running on an already-customized project (not for creating a new one —
  that's `template-setup`).

**The ship path**

- `local-review` — before every push. This is what makes the
  don't-over-commit rule in `docs/rules/commits.md` work — run it before
  committing, not after CI fails.
- `typesafe` — audits the type assertions this branch introduced; the
  enforcement arm of the no-`any` rule in `docs/rules/code-quality.md`.
- `e2e-review` — before opening a PR for a UI/flow change.
- `preview-acceptance-testing` — the pre-merge gate against the PR's live
  Vercel preview, once a PR is open.
- `e2e-build` — orchestrates all of the above plus Codex, driving an
  already-approved plan to a merge-ready PR. Written against Claude Code's
  subagent tooling, so from Qwen Code treat it as a checklist, not a script.

**Day-to-day helpers**

- `sql-preview`, `seed-for-pr`, `local-feature-testing`
- `create-issue` — file work as a GitHub issue an autonomous agent can pick
  up, instead of implementing it now.
- `dogfood` — exploratory QA of a running app, with full repro evidence.
  Complements `e2e-review`: that one runs the specs you wrote, this one hunts
  for what nobody wrote a spec for.

**Product and ops**

- `posthog-funnel-builder` — build a PostHog funnel from a described journey,
  grounded in the events the code actually fires.
- `sentry-digest` — weekly blameless production error review, attributed and
  prioritized.

Some of these lean on MCP servers (PostHog, Sentry, a browser). Check the
server is actually configured in your Qwen Code settings before starting,
and say so plainly if it isn't rather than faking the output.

## Commands

The `cicd` workflow — review the diff, fix what matters, open or update the
PR, watch CI to green, work the review comments — has two committed
definitions: `.claude/commands/cicd.md` (Claude Code) and
`.codex/commands/cicd.md` (Codex). They are the same checklist in two tool
dialects. Read either one and follow it.

If you add a Qwen Code custom command for it, it goes in
`.qwen/commands/cicd.toml`, and it joins the same rule the other two have:
keep every copy in sync when any of them changes.
