# Code style

- Formatting is prettier's (`.prettierrc.json`: tabs, no semicolons, single
  quotes, no trailing commas, width 100, Tailwind classes auto-sorted). Run
  `pnpm format`; never hand-format against it.
- Every API route has a Zod input schema parsed at runtime
  (`createApiRoute`/`createCronRoute` in `src/server/api/route-factory.ts`
  enforce this). No hand-written wire types — derive them with `z.infer`.
- Functions taking more than one argument take a single object param.
  Booleans are prefixed `is`/`has`/`should`/`can`. Null checks use `== null`
  / `!= null`. No `@ts-ignore`/`@ts-expect-error` — fix the type or narrow
  it. No comments unless they state a non-obvious constraint; don't
  describe what the code already says.
- Dates crossing an API boundary are ISO strings. Time logic is UTC; only
  display formatting may localize.
- Styling goes through Tailwind utility classes and the design tokens in
  `src/app/globals.css`'s `@theme` block — see `DESIGN.md`. Don't hardcode
  a color, spacing, or radius value that already has a token. Use `cn()`
  (`src/lib/cn.ts`) to merge conditional classes, and `class-variance-authority`
  for any component with more than two visual variants.
