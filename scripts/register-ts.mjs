import { register } from 'node:module'

// Loaded via `node --import` before the test runner starts, so unit tests can
// import modules straight from `src/` (`.ts`/`.tsx`, extensionless, and `@/`
// aliased) without booting Next — a fast `pnpm test` lane for pure logic that
// doesn't need a browser or a server.
//
// Needs a Node that strips types natively (>= 22.18, where it stopped being
// flagged — see package.json `engines`). Below that, every test importing
// `src/` dies with ERR_UNKNOWN_FILE_EXTENSION; that is exactly why CI pins
// Node 22 rather than 20 (see .github/workflows/ci.yml).
register('./ts-resolve-hooks.mjs', import.meta.url)
