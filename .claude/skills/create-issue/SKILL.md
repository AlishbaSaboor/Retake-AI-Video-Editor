---
name: create-issue
description: Create well-structured GitHub issues optimized for autonomous coding-agent implementation. Use this skill whenever the user wants to create a GitHub issue, file a bug, request a feature as an issue, or says "create an issue for...", "file an issue", "make a ticket for", or describes work they want tracked as a GitHub issue. Also trigger when the user describes a feature or fix and you suspect they want it tracked rather than implemented immediately.
---

# Create issue

Turn a conversational request into a GitHub issue that an autonomous agent can
pick up and implement independently. The issue must be self-contained — the
implementing agent won't have this conversation, only the issue body, the
codebase, and `AGENTS.md`.

Think of yourself as a tech lead translating a product request into a clear
engineering ticket.

## 1. Understand the request

If the request is clear enough to act on, move to step 2. Only ask a
clarifying question if:

- You genuinely can't tell what they want built.
- There's an ambiguity that would send the implementing agent down the wrong
  path.
- The scope is large enough that it should probably be split into several
  issues.

Don't over-interview. The user chose to file an issue rather than implement it
themselves — they want this to be quick.

## 2. Gather context

This is what makes the issue actually useful to an autonomous agent.

**Read the repo's rules.** `AGENTS.md` at the repo root, plus the specific
files under `docs/rules/` that the work touches — `database.md` and
`migrations.md` for schema work, `auth.md` for anything session-related,
`state-management.md` and `components.md` for UI, `error-handling.md` for
anything that can fail, `feature-approach.md` for scoping. Pull out the
pitfalls that are **directly relevant** to what's being asked. The
implementing agent will read those files too — you're highlighting what's easy
to miss, not restating the whole doc.

**Check memory.** If `MEMORY.md` exists, scan it for active project context —
ongoing work, recent decisions, known constraints.

**Identify the area.** Name the part of the tree the work likely touches
(`src/server/api/`, `src/components/ui/`, `prisma/schema/`, …) so the
implementing agent knows where to start looking.

## 3. Draft the issue

```markdown
## Summary

[1-3 sentences: what needs to be built or fixed, and why. Written for an
engineer who knows the codebase but has none of the conversation context.]

## Requirements

- [ ] [Concrete, independently verifiable requirement]
- [ ] [Another]

## Architecture context

[Which areas of the codebase this touches — not file paths and line numbers,
just enough to orient. If a repo pattern applies, name it: "goes through the
Prisma client in `src/server/db`, not a raw SQL client", "user-caused failures
throw `AppError`", "server state via TanStack Query, not a new store".]

## Gotchas

[Only when there are genuinely relevant pitfalls. One or two lines each — what
to watch out for and why.]

- **[Gotcha]**: [What to watch out for and why]
```

### Template rules

- **Summary** — specific about the what and the why. "Add CSV export" is too
  vague. "Add a CSV export button to the reporting dashboard so users can pull
  their own data" tells the agent what to build and where.
- **Requirements** — acceptance criteria, each independently verifiable. No
  implementation detail unless it's a real constraint.
- **Architecture context** — orient, don't prescribe. Point at the area and the
  established pattern; the agent writes the code.
- **Gotchas** — relevant ones only. A UI-only issue doesn't need the migration
  rules. A schema change does (CI generates migrations from the schema diff —
  the agent must not hand-write one).
- **No filler sections.** No "Background" that restates the summary, no
  "Testing" that says "write tests". Every section earns its place.

## 4. Present, then create

Show the draft and ask for confirmation:

```
Here's the issue I'll create:

**Title:** feat: add CSV export to the reporting dashboard

[issue body]

Want me to create this, or any changes?
```

**Title** uses Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`,
`perf:`) per `docs/rules/commits.md`, under 70 characters, specific: "fix:
password reset email never sends for SSO users", not "fix: auth bug".

Once confirmed:

```bash
gh issue create --title "the title" --body "$(cat <<'EOF'
[issue body]
EOF
)"
```

Share the issue URL afterwards. Add `--label` only if the user asks.

## What not to do

- **Don't explore the codebase** hunting for specific files and line numbers.
  The implementing agent does that. You're writing a ticket.
- **Don't over-specify implementation.** "Wrap it in a `useMemo` inside a
  `useCallback`" is too prescriptive. "Server Component for the data fetch,
  Client Component only for the interactive filter" is the right altitude — it
  names the established pattern without dictating lines.
- **Don't dump every gotcha.** A button-styling issue doesn't need the auth
  boundary warning.
- **Don't ask too many questions.** "Add CSV export to the reporting page" is
  enough to write a good issue. File encoding and delimiter choices are the
  implementing agent's to make.
