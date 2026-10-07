import 'server-only'
import { z } from 'zod'
import { AppError } from '@/lib/errors/app-error'

// Gemini and Deepgram both answer 429 (rate-limited) or 503 (overloaded)
// under load — the user's cue to retry, not a bug to report, so an AppError.
const busyResponse = z.object({ status: z.union([z.literal(429), z.literal(503)]) })

export function rethrowAsBusy(error: unknown): never {
	if (busyResponse.safeParse(error).success) {
		throw new AppError('The AI is busy right now. Try again in a moment.', { status: 503 })
	}
	throw error
}
