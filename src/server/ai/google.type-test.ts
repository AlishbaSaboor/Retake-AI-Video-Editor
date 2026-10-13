import { generateContent } from './google'

// The test for "every Gemini call has a time limit". It runs at type-check
// time (`pnpm typecheck`, CI's check job), not at runtime: nothing imports or
// calls this. If `timeoutMs` becomes optional again, the call below compiles,
// the @ts-expect-error is unused, and the type check fails.
export function everyGeminiCallHasATimeLimit(): void {
	const noTimeLimit = { feature: 'parse_edit_command', model: 'gemini-3.5-flash-lite' } as const
	// @ts-expect-error timeoutMs is required
	void generateContent(noTimeLimit, { contents: 'x' })
}
