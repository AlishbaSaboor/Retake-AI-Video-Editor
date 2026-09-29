# Components

`src/components/ui/` is a small foundation, not a full suite — `Button`,
`Input`, `Label`, `Textarea`, `Card`, `Badge`, and the toast system
(`Toast`/`Toaster`/`toast()`). Add to it as the project needs more (Dialog,
Select, Tabs, ...); don't pre-build a component nobody's using yet.

## The convention every one of these follows

- **Design tokens only** — `bg-accent`, `text-text-muted`, `border-border`,
  `rounded-lg`, never a hardcoded hex/pixel value. See `DESIGN.md`.
- **`cva` for anything with more than two visual states** (`Button`'s
  `variant`/`size`, `Badge`'s `variant`) — see `docs/rules/code-style.md`.
  A component with only one visual shape (`Input`, `Textarea`) skips `cva`
  entirely; don't add a variant system nobody's asked for yet.
- **`cn()`** (`src/lib/cn.ts`) merges the base classes with a caller-supplied
  `className` on every component — a consumer can always override/extend,
  Tailwind's cascade never fights itself.
- **Radix primitives for anything genuinely interactive** — focus trapping,
  portal rendering, live-region ARIA announcements, and keyboard handling
  are easy to get subtly wrong by hand. `Label` and the toast system are
  built on `@radix-ui/react-label`/`@radix-ui/react-toast`; `Button`'s
  `asChild` prop uses `@radix-ui/react-slot`. This matches the org's own
  convention — `8x-marketing` and the org's shadcn-based repos both build
  on Radix the same way, not a template-specific choice.
- **No `forwardRef`** — React 19 accepts `ref` as a plain prop on function
  components, and `React.ComponentProps<'button'>` (etc.) already includes
  it. If you're writing a new primitive and reach for `forwardRef`, stop —
  that's the pre-React-19 pattern your training data defaults to.
- **Server Components by default** — `Button`, `Input`, `Textarea`, `Card`,
  `Badge` have no `'use client'` directive and don't need one; only
  `Label` and the toast system do, because Radix's own implementation for
  those specific primitives requires client-side interactivity. Don't add
  `'use client'` to a new primitive unless it actually uses a hook, an
  event handler that needs to run client-side, or a Radix primitive that
  itself requires it.

## Icons

Icons are not in `ui/` as individual components — they come from
`src/components/ui/icons.tsx`, a single wrapper around whichever provider
this project picked (Phosphor by default). Import from
`@/components/ui/icons`, never from the provider package; ESLint enforces
it. See `docs/rules/icons.md`.

## Toasts — how they connect to the error-handling system

`toast()` (`src/lib/toast.ts`) is a plain function, callable from anywhere
(not just inside a component) — the deliberate reason is `captureError`/
`captureClientError` (`docs/rules/error-handling.md`) hand back a
`userMessage` from a `catch` block or a mutation's `onError`, neither of
which is itself a component:

```ts
const mutation = useMutation({
	mutationFn: createThing,
	onError: (error) => {
		toast({ title: "Couldn't save", description: error.message, variant: 'destructive' })
	}
})
```

`<Toaster />` is mounted once in the root layout (`src/app/[locale]/layout.tsx`)
— nothing else to wire up per call site. `useToast()` (also in
`src/lib/toast.ts`) is what `<Toaster />` itself uses to subscribe to the
current queue; application code should call `toast()`, not `useToast()`.
