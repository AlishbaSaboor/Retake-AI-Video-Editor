# Icons

**Every icon in this codebase is imported from `@/components/ui/icons`.**
That file is the only place an icon provider (lucide, phosphor, heroicons,
...) is imported, and `no-restricted-imports` in `eslint.config.mjs` fails
the build if anything else imports one directly.

The template ships with **Phosphor** (`@phosphor-icons/react`), imported
from its `/ssr` entry — the root entry's icons read defaults from a React
context, which makes them Client Components without saying so, and a Server
Component rendering one fails at request time. `template-setup` asks
whether this project wants a different provider and swaps it there; after
setup, treat the answer as settled and don't reopen it per component.

## Why a wrapper and not just importing the provider

- **A provider swap is one file.** Six months in, a design refresh picks a
  different icon set. With direct imports that's a find-and-replace across
  every component, each with slightly different props. Here it's three edits
  inside `icons.tsx`: the import, `Glyph`'s body, the export list.
- **Names are roles, not the provider's catalog.** `SpinnerIcon`, not
  `CircleNotchIcon`; `ChevronDownIcon`, not `CaretDownIcon`. Same rule as the design
  tokens in `DESIGN.md` — `--accent`, not `--blue-500`. The provider's name
  for a glyph is an implementation detail, and the next provider will spell
  it differently.
- **One place to enforce defaults.** Size, `currentColor`, `aria-hidden`,
  and the house stroke weight are set once in `Glyph`. Without the wrapper
  every call site re-decides them, and they drift.
- **The prop surface stays narrow.** `IconProps` is `size` and `className`,
  deliberately not the provider's own props. A call site passing phosphor's
  `weight` is a call site that breaks on swap.

## Adding an icon

1. Import it from the provider at the top of
   `src/components/ui/icons.tsx`.
2. Add one line to the export list, named for what it means in this product,
   alphabetical: `export const ArchiveIcon = (props: IconProps) => <Glyph source={Archive} {...props} />`.
   The export name describes the role; `source` is whatever the provider
   happens to call that glyph.
3. Import it wherever you needed it: `import { ArchiveIcon } from '@/components/ui/icons'`.

Add icons as components need them. Don't pre-export the provider's whole
catalog — same reasoning as `docs/rules/components.md`'s "don't pre-build a
component nobody's using yet."

## Accessibility

**Icons take no label prop, on purpose.** Every icon is rendered
`aria-hidden`, because in practice every one of them is decorative: it sits
beside a text label, or inside a control that carries its own name. A
labelled glyph inside an already-labelled button just makes a screen reader
say it twice.

An icon-only button labels **the button**, never the glyph:

```tsx
<button aria-label="Dismiss">
	<CloseIcon />
</button>
```

`src/components/ui/toast.tsx`'s close button is the worked example.
`DESIGN.md`'s accessibility baseline says the same thing from the other
side: icon-only buttons get an `aria-label`.

## Sizing and color

`size` is in pixels and defaults to 16, which pairs with `text-sm`. Color is
never set on an icon: `Glyph` renders `currentColor`, so an icon inherits
the text color of whatever contains it and stays correct in dark mode for
free. If you find yourself passing a color class to an icon, set it on the
parent instead.
