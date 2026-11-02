@AGENTS.md

Everything above applies to any coding agent working in this repo; rules
live in `AGENTS.md`, not here. This file holds only my standing rules for
Claude Code sessions.

## Standing rules

- Once a task is finished and every check passes, commit and push on your
  own. Stop and ask if anything fails or is destructive.
- Commit code once per finished feature.
- Never add `Co-Authored-By`, `Claude-Session` or "Generated with Claude
  Code" lines to commits or pull requests.
- Zero API cost unless I approve it.
- Verify audio/video work for real, against the actual output, not just
  that it compiles.
- Update `PROGRESS_NOTES.md` after each feature.
- After each push, check the CI run (`ci.yml`: lint, typecheck, unit
  tests, build) for that commit and wait for its result. If it fails, read
  the failure, fix it, and push the fix before starting the next task.
  The e2e, database and migration jobs (`manual.yml`) run only when started
  by hand from the Actions tab.
- A test that's flaky on CI but passes locally and on retry: record it in
  section 4c of `PROGRESS_NOTES.md` and carry on. Stop only for a failure
  that persists.

`.claude/` (local skills and settings) and `.claude-logs/` are gitignored and
never committed.
