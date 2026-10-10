// Node's ESM resolver wants the extension written out; TypeScript source in
// this repo is written for a bundler and leaves it off. Rather than putting
// `.ts` into every import in `src/` to suit the test runner, the runner
// retries a failed resolution with the extensions TypeScript would have tried.
// Node strips the types itself once the file is found.
//
// `@/` is resolved the same way tsconfig's `paths` resolves it (`@/*` →
// `./src/*`), so a unit test can import a module by the same alias the app
// uses — e.g. `import { redact } from '@/server/lib/logger'` — without booting
// Next.

const CANDIDATE_SUFFIXES = ['.ts', '.tsx', '/index.ts']
const ALIAS_PREFIX = '@/'
const SRC_URL = new URL('../src/', import.meta.url).href

function withSuffixes(specifier) {
	return [specifier, ...CANDIDATE_SUFFIXES.map((suffix) => `${specifier}${suffix}`)]
}

// `server-only` is Next's own: on the server it is an empty module (the
// `react-server` export Next resolves it to), so a unit test of server code
// loads it the same way rather than hitting the client-side throw.
const SERVER_ONLY = 'server-only'
const SERVER_ONLY_TARGET = 'next/dist/compiled/server-only/empty.js'

export async function resolve(specifier, context, nextResolve) {
	if (specifier === SERVER_ONLY) return nextResolve(SERVER_ONLY_TARGET, context)
	if (specifier.startsWith(ALIAS_PREFIX)) {
		const base = `${SRC_URL}${specifier.slice(ALIAS_PREFIX.length)}`
		for (const candidate of withSuffixes(base)) {
			try {
				return await nextResolve(candidate, context)
			} catch {
				continue
			}
		}
	}

	try {
		return await nextResolve(specifier, context)
	} catch (error) {
		// A package path with no `exports` map (`next/navigation`): the file
		// itself, as a bundler would find it.
		if (!specifier.startsWith('.'))
			return nextResolve(`${specifier}.js`, context).catch(() => {
				throw error
			})
		for (const suffix of CANDIDATE_SUFFIXES) {
			try {
				return await nextResolve(`${specifier}${suffix}`, context)
			} catch {
				continue
			}
		}
		throw error
	}
}
