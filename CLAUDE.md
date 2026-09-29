@AGENTS.md

Everything above applies to any coding agent working in this repo (Claude,
Codex, Cursor, whatever) — it lives in `AGENTS.md`, not here, on purpose,
since `AGENTS.md` is the file every tool reads and `CLAUDE.md` is
Claude-Code-only. Don't duplicate rules back into this file; add them to
`AGENTS.md` so they reach every tool, not just this one.

This file holds the two things that genuinely are Claude-Code-specific.

## Session logs

`.claude-logs/` is tracked, not gitignored — the transcript for the session
that produced a change belongs on the branch that ships it. Stage it
immediately before every `git push`, separately from the code commit.

## Skills

See `.claude/skills/*/SKILL.md` for full detail. In short:

**Setup, once**

- `template-setup` — run once, right after creating a new repo from this
  template.
- `dev-onboarding` — run once per developer, getting a local environment
  running on an already-customized project (not for creating a new one —
  that's `template-setup`).
- `ai-usage-setup` — wire up (or strip out) AI spend tracking for this
  project, and pick which providers and models it may call.
  `template-setup` asks the question that leads here.

**The ship path**

- `local-review` — before every push. This is what makes the
  don't-over-commit rule in `docs/rules/commits.md` work — run it before
  committing, not after CI fails.
- `typesafe` — audits the type assertions this branch introduced; the
  enforcement arm of the no-`any` rule in `docs/rules/code-quality.md`.
- `ai-usage-check` — proves AI calls still work and still get costed, end to
  end. Run it on any branch that touches an AI call, a model, or
  `src/server/lib/ai-usage/`. `local-review` and `e2e-review` both defer to
  it rather than duplicating its checks.
- `e2e-review` — before opening a PR for a UI/flow change.
- `preview-acceptance-testing` — the pre-merge gate against the PR's live
  Vercel preview, once a PR is open.
- `e2e-build` — orchestrates all of the above plus Codex, driving an
  already-approved plan to a merge-ready PR. Requires Codex installed.

**Day-to-day helpers**

- `staging-migration`, `sql-preview`, `seed-for-pr`, `local-feature-testing`
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

**Meta**

- `skill-creator` — write, edit, and eval skills. Use it when this project
  needs a skill this template doesn't ship.

## Commands

`/cicd` (`.claude/commands/cicd.md`) reviews the diff, fixes what matters,
opens or updates the PR, watches CI to green, and works the review comments.
`.codex/commands/cicd.md` is its Codex-facing mirror — same checklist, Codex
tool conventions. Keep the two in sync when either changes.
