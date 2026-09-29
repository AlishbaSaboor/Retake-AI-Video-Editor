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
import { pathToFileURL } from 'node:url'

const CANDIDATE_SUFFIXES = ['.ts', '.tsx', '/index.ts']
const ALIAS_PREFIX = '@/'
const SRC_URL = pathToFileURL(new URL('../src/', import.meta.url).pathname).href

function withSuffixes(specifier) {
	return [specifier, ...CANDIDATE_SUFFIXES.map((suffix) => `${specifier}${suffix}`)]
}

export async function resolve(specifier, context, nextResolve) {
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
		if (!specifier.startsWith('.')) throw error
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
