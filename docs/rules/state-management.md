# State management

- **Server state** (anything fetched/mutated from a Client Component after
  the initial Server Component render): TanStack Query, via
  `<QueryProvider>` (`src/components/query-provider.tsx`). `QueryClient` is
  created inside a `useState` initializer, never at module scope — a
  module-level client is shared across every request on the server and
  leaks one user's cached data into another's response.
- **Client-only UI state** (modal open/closed, wizard step — nothing
  server-derived): default to local `useState`/`useReducer` and URL search
  params. Don't add a global store until a project genuinely needs shared
  client state a URL param can't express; Zustand is the recommended pick
  if/when that happens (already used in 8x-mobile), but it's not installed
  here by default — add it deliberately.
