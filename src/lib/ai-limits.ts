// Each signed-in user's daily ceiling on the paid AI actions, by kind, so a
// cheap one can't use up a costly one's allowance. The one place to change
// the numbers: the actions (src/server/lib/ai-allowance.ts) and the Pricing
// page both read them from here. A change ships like any other code change
// (a PR, CI, merge, deploy); it takes effect for today's counts at once.
//
// Worst case at these numbers, by the highest cost each call has been seen
// at (ai_usage): about $5 a day for one account, nearly all of it Make it.

export const DAILY_AI_LIMITS = {
	/** Typed edit commands (Gemini; ~$0.0004 each). */
	command: { perDay: 300, what: 'typed edit commands' },
	/** Spoken commands (Deepgram; ~$0.0003 each). */
	voice: { perDay: 200, what: 'spoken commands' },
	/** Transcripts of a video's speech, up to 5 minutes each (Deepgram; up to ~$0.02 each). */
	transcript: { perDay: 30, what: 'transcripts' },
	/** Finding a video's highlights (Gemini; ~$0.0007 each). */
	highlights: { perDay: 30, what: 'highlight searches' },
	/** Make it: a plan, its check, or a follow-up each count one (Gemini; a plan up to ~$0.06). */
	make_it: { perDay: 60, what: 'Make it requests' }
} as const

export type AiAllowanceKind = keyof typeof DAILY_AI_LIMITS
