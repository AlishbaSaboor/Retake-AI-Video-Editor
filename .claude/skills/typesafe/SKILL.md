---
name: typesafe
description: Remove trivial TypeScript type assertions from the current branch's diff against main and flag the non-trivial ones. Use when the user says "/typesafe", "tighten types on this branch", "remove type assertions", "make this branch type-safe", or asks to audit `as`, `as unknown`, `any`, or non-null assertions introduced by the current change.
---

# Typesafe — branch type-assertion audit

Audit the type assertions this branch introduced or touched. Fix the trivial
ones with real types, guards, or narrowing. Flag the non-trivial ones so the
user can decide. Never suppress an error to make a cast disappear.

This is the enforcement arm of the "no `any`" rule in
`docs/rules/code-quality.md`. The goal is honest types, not silenced errors.

## 1. Identify the changed files

```bash
git fetch origin main
git diff origin/main...HEAD --name-only
```

Filter to `*.ts` / `*.tsx`. Exclude `.claude-logs/`, generated output
(`prisma/generated/`, `next-env.d.ts`), and tests unless the user asked for
them.

## 2. List every assertion in those files

```bash
git diff origin/main...HEAD -- '*.ts' '*.tsx' \
  | grep -nE '^\+.*( as [A-Za-z_<{(]| as unknown| as any| as never|@ts-ignore|@ts-expect-error)'
```

Then read each hit in its file for context. Also scan for non-null assertions
(`!.`, `!;`, `!)`) in the changed hunks.

## 3. Classify before editing anything

### Trivial — rewrite in place

- **Empty-array casts** — `[] as Foo[]` → `const xs: Foo[] = []` (annotate the
  binding instead of asserting the literal).
- **Redundant casts over an already-correct inferred type.** Prisma's
  generated types, Zod's `z.infer`, and TanStack Query's generics usually
  already produce the right shape. Delete the cast and let inference work. If
  the compiler then complains about `null`, the column really is nullable —
  handle it (`?? default`, or a guard), don't re-add the cast.
- **String → literal union** — `value as 'a' | 'b'` → a runtime check
  (`if (value === 'a' || value === 'b')`) or a type predicate
  (`function isMode(v: string): v is 'a' | 'b'`). Common on Radix
  `onValueChange` and on `searchParams` values.
- **Shape probes on `unknown`** — `(raw as { x?: number })?.x` → a real
  runtime check: `typeof raw === 'object' && raw !== null && 'x' in raw && typeof raw.x === 'number'`.
- **Non-null assertions the code can prove** — `xs.find(...)!.id` inside a
  `.map` → a type-predicate `.filter()` upstream:
  `.filter((r): r is R & { job: NonNullable<R['job']> } => r.job != null)`.
- **`process.env.FOO as string`** — this repo validates env through
  `src/lib/env.ts`; read it from there instead of asserting.

### Keep — not actually type assertions

`as const` is a _const_ assertion. It narrows literals and freezes arrays;
removing it widens the type and usually breaks callers. Leave these alone:

- `kind: 'user' as const` in object literals
- `['project', id] as const` for TanStack Query keys
- `[...] as const` for readonly tuples

`satisfies` is also fine — it checks without widening. Prefer it over `as`
when a cast is genuinely about conformance rather than narrowing.

### Non-trivial — flag, don't fix silently

These need a decision, often a new Zod schema or a shared helper:

- **`Json` → domain type at a storage boundary**, e.g.
  `row.metadata as unknown as Metadata`. The correct fix is validating with
  Zod at the read site (`docs/rules/code-style.md` requires Zod at API
  contracts — the same argument applies to `Json` columns). That's usually a
  cross-cutting change touching every read of that column.
- **Casts papering over a real mismatch** — the source type genuinely lacks
  the target's fields and there is no boundary helper. Flag the underlying
  type bug, don't launder it.
- **Casts inside generic helpers or library wrappers** where the assertion
  encodes a contract the library's own types can't express.
- **Non-null assertions resting on an invariant the type system can't see**
  (e.g. a parent component guarantees the prop is set).

For each flagged item record: `file:line`, the literal cast, one sentence on
why it's non-trivial, and the rough shape of a proper fix.

## 4. Apply the trivial fixes

Edit, then after each substantive change:

```bash
pnpm typecheck 2>&1 | head -40
```

A new error means the cast was hiding a real type bug. Either fix the
consumer's expectation honestly, or reclassify the cast as non-trivial and
put it back. Never silence the error.

## 5. Confirm clean

```bash
pnpm typecheck && pnpm lint
```

Both must pass. If `pnpm typecheck` was already failing before you started,
say so in the report and don't chase unrelated errors.

## 6. Report

Three sections, terse — the user can read the code.

**Removed** — one bullet per assertion: file, and what replaced it (predicate,
runtime check, dropped boilerplate).

**Kept** — `as const` / `satisfies` with `file:line` and a one-line reason.
Skip the section if empty.

**Flagged — non-trivial** — for each: `path/to/file.ts:LINE`, the cast, why
it's non-trivial, and the suggested fix shape.

## Guardrails

- **Never** add `any`, widen a parameter to `unknown`, or move an
  `as unknown as` into a different file. The point is to express the truth,
  not relocate the lie.
- **Never** add `@ts-ignore` or `@ts-expect-error`. If suppression is the only
  way, the cast wasn't trivial.
- **Never** loosen `tsconfig.json` strictness flags.
- **Never** touch assertions this branch didn't introduce. Scope is strictly
  the diff against `main`, unless the user asks for a full-repo audit.
- **Don't refactor unrelated logic** while you're in the file.
- **Test files** — only when the user asks or the cast causes a real error.
  Test mocks legitimately need controlled casts.

## Quick reference

| Bad                             | Good                                                 |
| ------------------------------- | ---------------------------------------------------- |
| `[] as Foo[]`                   | `const xs: Foo[] = []`                               |
| `row.owner as unknown as User`  | `row.owner` (the Prisma `include` already types it)  |
| `(v ?? null) as Status \| null` | `v ?? null` (the column is already `Status \| null`) |
| `value as 'a' \| 'b'`           | `if (value === 'a' \|\| value === 'b') …`            |
| `(raw as { x?: number })?.x`    | `'x' in raw && typeof raw.x === 'number'`            |
| `xs.find(p)!.id`                | type-predicate `.filter()` upstream                  |
| `process.env.API_URL as string` | validated export from `src/lib/env.ts`               |
| `payload as Config`             | `configSchema.parse(payload)`                        |

## When to stop

Once the only remaining assertions in the diff are kept `as const` /
`satisfies` and one or two genuinely flagged casts, you're done. Don't
refactor for its own sake.
