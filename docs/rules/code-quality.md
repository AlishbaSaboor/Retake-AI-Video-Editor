# Code quality

The goal of every rule here is the same: keep the codebase predictable
enough that an AI agent (or a new engineer) can autonomously extend it or
fix a bug without first reverse-engineering intent. Predictable structure
and honest types do more for that than documentation does — see
"Docstrings" below.

## No `any`, no `as any`

`@typescript-eslint/no-explicit-any` is enforced (`eslint.config.mjs`).
`any` doesn't just weaken the one value it's applied to — it's contagious,
silently disabling type checking on every variable, parameter, and return
value it touches downstream, with no further warning anywhere in that
chain ([typescript-eslint docs](https://typescript-eslint.io/rules/no-explicit-any/)).

Use instead, in order of preference:

- **`unknown`** for a value of uncertain shape — unlike `any` it can't be
  used until narrowed with a type guard, forcing a real runtime check.
- **Generics** to preserve the relationship between an input and output
  type instead of erasing it.
- **Proper interface/type modeling** — define the actual shape.
- **`satisfies`** to validate an object against a type without widening
  its inferred type the way an annotation or cast would.
- **Zod** to turn untrusted `unknown` (an API response, `JSON.parse`) into
  a typed value at a runtime boundary — this is already the pattern every
  API route uses (`docs/rules/code-style.md`).

Legitimate exceptions are narrow and documented, not blanket: an untyped
third-party library with no `@types`, or an incorrect upstream type
definition — paired with `@ts-expect-error` and a comment explaining why,
not a silent `any`.

## No god files

There's no hard line-count gate in this template's ESLint config — line
count is a proxy, not the real signal, and a hard-enforced number produces
exactly the kind of noise `no-magic-numbers` does (see below). The actual
signal is responsibility count: a file mixing routing, data access,
business logic, and rendering is a god file at 80 lines just as much as at 800. Split by concern, name the file for what it does.

If a soft target is useful during review: ESLint's own `max-lines` /
`max-lines-per-function` defaults are 300 / 50
([ESLint docs](https://eslint.org/docs/latest/rules/max-lines),
[max-lines-per-function](https://eslint.org/docs/latest/rules/max-lines-per-function)).
Treat crossing those as a prompt to ask "does this file still have one
job," not an automatic failure.

## DRY, without premature abstraction — the Rule of Three

First time you write something, just write it. Second time you write
something similar, duplicate it — it's fine, even though it stings a
little. Third time, extract it into its own helper/module
([origin: Don Roberts, via Martin Fowler's _Refactoring_](<https://en.wikipedia.org/wiki/Rule_of_three_(computer_programming)>)).
Two occurrences aren't enough data to know what the _real_ shared shape is;
extracting too early tends to produce an abstraction that's wrong or too
narrow, which then accumulates conditionals and parameters as mismatched
call sites get forced into it.

If a file's function/logic already exists in 2+ other files, extract it to
its own tool/helper file **before** adding a third copy — don't wait for
the third copy to also land duplicated.

The counter-caveat, worth knowing before reflexively abstracting: Sandi
Metz, ["The Wrong Abstraction"](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction) —
"duplication is far cheaper than the wrong abstraction." If an extracted
helper is accumulating special-case branches for callers that don't
actually share behavior, inline it back and re-extract once the real
shared shape is clearer. The Rule of Three is a heuristic for _when_ to
extract, not a license to keep a bad extraction forever.

## No magic numbers

Deliberately **not** an ESLint rule here — `no-magic-numbers` is
notoriously noisy in real code (it has no default exemption for `0`, `1`,
`-1`, or array indices, so `data[0]` or `canvas.width / 2` trip it
unmodified; a well-known typescript-eslint issue titled "false positives
everywhere" was closed as "working as intended" rather than fixed —
[typescript-eslint#766](https://github.com/typescript-eslint/typescript-eslint/issues/766)).
Enforced by review instead (`local-review`'s manual pass): a numeric
literal whose meaning isn't obvious from context — a threshold, a rate, a
timeout, a limit — gets a named constant. `data[0]`, loop counters, and
genuinely self-evident values don't need one.

## Logging

- **No `console.log`/`console.debug`/`console.info` left in committed
  `src/` code.** ESLint's `no-console` is enforced there (scripts/ is
  exempt — operational tooling legitimately prints to stdout). Reach for
  the structured logger (`src/server/lib/logger`, `docs/rules/logging.md`)
  instead of `console.*` — a `console.log` vanishes into an ephemeral
  serverless log nobody searches, a structured line lands in the drain
  queryable by field. If you add a `console.log` while debugging, remove it
  before the PR, not after review flags it.
- **Errors go through `captureError`/`captureClientError`, never
  `console.error` or a direct `Sentry.captureException` call**, in
  application code — see `docs/rules/error-handling.md`.
  `src/server/api/route-factory.ts` is the reference: it catches, calls
  `captureError`, and returns the normalized message, never a raw
  `console.error`. The logger records _what happened_; Sentry records _what
  broke_ — `docs/rules/logging.md` draws the line.
- **User-facing messages are friendly, never implementation.** A response
  body, a toast, an error page — never a stack trace, a raw DB error
  string, or an internal error code a user can't act on. This isn't just
  UX: verbose errors are free reconnaissance for an attacker (framework
  version, query shape, occasionally a connection string) — see
  [OWASP: Improper Error Handling](https://owasp.org/www-community/Improper_Error_Handling).
  Log the real detail server-side (Sentry, via `captureError`), show the
  user the `userMessage` it hands back instead.

## Docstrings — earn their keep, don't restate the signature

Default to no comment. Write one when it encodes something the code can't
express itself: _why_ a decision was made, a non-obvious invariant, a side
effect, a workaround for a specific bug. A docstring that just restates
what a well-named function already says is noise — worse for an AI agent
than for a human, since it dilutes the signal the model is trying to use
to understand intent
([ACM TOSEM, "Less Is More: DocString Compression"](https://arxiv.org/pdf/2604.21090)).
The strongest signal isn't prose at all — it's a machine-checkable
contract: a Zod schema, a precise type, a well-named single-responsibility
function. Prefer building that over writing a paragraph explaining a
looser one.

## Naming conventions

- **camelCase** — variables, function names, object properties, Prisma
  model _fields_ (`userId`, `createdAt`).
- **PascalCase** — React components, `type`/`interface` declarations,
  classes, Prisma model _names_ (`model User { ... }`).
- **SCREAMING_SNAKE_CASE** — true module-level constants fixed at compile
  time (`MAX_RETRIES`), not just a locally-scoped `const`.
- **snake_case** — reserved for the actual Postgres column/table names.
  Keep TypeScript-side names camelCase and bridge the two with Prisma's
  `@map`/`@@map` (`firstName String @map("first_name")`) rather than
  letting snake_case leak into application code —
  [Prisma docs: Using @map and @@map](https://www.prisma.io/docs/orm/prisma-schema/data-model/database-mapping).

## Easy to maintain, not maximally clever

All of the above serve one goal: the next person (or agent) touching this
code shouldn't have to hold more in their head than the change actually
requires. If a rule above and "ship the simple thing" are in tension for a
specific case, see `docs/rules/feature-approach.md` — that's where the
80/20 framing for new work lives, and it explicitly does not apply once
you're adjusting something that already exists in production.
