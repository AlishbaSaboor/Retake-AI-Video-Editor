import { isPlainAiStatus } from '@/lib/ai-failure'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { withTimeout } from '@/lib/with-timeout'
import type { Transcript } from '@/app/[locale]/editor/audio/transcript'
import type { Cut } from '@/app/[locale]/editor/model/cleanup'
import type { Size } from '@/app/[locale]/editor/model/transform'
import { checkMakePlan, planMakeIt } from './actions'
import { framePixels } from './frames'
import {
	applyCheck,
	CHECK_TIMEOUT_MS,
	checkFound,
	describePlan,
	FRAME_SEPARATOR,
	PAGE_GRACE_MS,
	PLAN_TIMEOUT_MS,
	planMake,
	type CheckReply,
	type MakeAnswer,
	type MakeReply
} from './make-plan'
import type { MakeChoices } from './make-questions'
import { loadTrack } from './music-track'
import { dominantColour } from './video-colours'

// Make it's plan as the page asks for it: the server's plan, its second
// check, and the edit made from them. No React: MakeIt's plan query runs it.

/** The picked video, read: where it plays from, how long it is, its picture's size. */
export type Video = { file: File; url: string; durationSeconds: number; picture: Size }
/**
 * What's being planned: the request, the answers to the quick questions
 * (null when none were shown), and the answers to any Gemini asked.
 */
export type Ask = { request: string; choices: MakeChoices | null; answers: MakeAnswer[] }

/**
 * Asks the server for a plan. A failure comes back as what to tell the
 * user: the server's own words for a refused key, a usage limit or a busy
 * AI (written for people), `unclear` for anything else (no answer in time
 * included), which is never shown as it is. The page stops waiting a little
 * after the server's own time limit, whatever happens to the request.
 */
async function requestPlan(input: Parameters<typeof planMakeIt>[0], unclear: string) {
	let result: Awaited<ReturnType<typeof planMakeIt>>
	try {
		result = await withTimeout(PLAN_TIMEOUT_MS + PAGE_GRACE_MS, () => planMakeIt(input))
	} catch (error) {
		captureClientError(error, { feature: 'make_it' })
		throw new Error(unclear)
	}
	if (!result.ok) throw new Error(isPlainAiStatus(result.status) ? result.error : unclear)
	return result.data
}

/**
 * The second check of a plan against its request. Its failure never stops
 * the plan: it's reported, and the plan shows as first made, saying so.
 */
async function checkPlan(
	request: string,
	choices: MakeChoices | null,
	planText: string
): Promise<CheckReply | null> {
	try {
		const result = await withTimeout(CHECK_TIMEOUT_MS + PAGE_GRACE_MS, () =>
			checkMakePlan({ request, ...(choices && { choices }), planText })
		)
		return result.ok ? result.data : null
	} catch (error) {
		captureClientError(error, { feature: 'make_it_check' })
		return null
	}
}

/**
 * The plan for what's being asked, as MakeIt's plan query makes it: the
 * server's reply (or the questions it asks first), made into an edit, then
 * checked against the request and made again with the check's fixes.
 * `unclear` is what to tell the user when planning fails for any reason not
 * written for people.
 */
export async function buildPlan({
	video,
	ask,
	frames,
	transcript,
	fillerCuts,
	unclear
}: {
	video: Video
	ask: Ask
	frames: string[]
	transcript: Transcript | null
	fillerCuts: Cut[]
	unclear: string
}) {
	const { reply, tracks } = await requestPlan(
		{
			request: ask.request,
			...(ask.choices && { choices: ask.choices }),
			answers: ask.answers,
			durationSeconds: video.durationSeconds,
			sentences: (transcript?.segments ?? []).map(({ startSeconds, endSeconds, text }) => ({
				startSeconds,
				endSeconds,
				text
			})),
			frames: frames.join(FRAME_SEPARATOR)
		},
		unclear
	)
	if (!reply) return { kind: 'none' } as const
	if (reply.questions.length > 0) {
		return { kind: 'questions', questions: reply.questions } as const
	}
	const music = reply.music ? await loadTrack(reply.music) : null
	// The video's own colour, for its look: from the pictures already taken.
	const videoColour = dominantColour(await framePixels(frames))
	const plan = (
		planned: MakeReply,
		tooShort: { keepOut: number[] } | null = null,
		unchecked = false
	) =>
		planMake({
			reply: planned,
			request: ask.request,
			durationSeconds: video.durationSeconds,
			picture: video.picture,
			transcript,
			fillerCuts,
			music,
			musicAvailable: tracks.length > 0,
			tooShort,
			unchecked,
			choices: ask.choices,
			videoColour
		})
	const musicAvailable = tracks.length > 0
	// The plan as made, then checked against the request and made again
	// with the check's fixes, if it found anything to fix (lengthened,
	// when it found the edit too short); made again unchecked when the
	// check couldn't run (a screen recording then shows whole).
	const first = plan(reply)
	const check = await checkPlan(
		ask.request,
		ask.choices,
		describePlan(reply, first.summary, first.edit.clips ?? [], transcript?.segments ?? [])
	)
	const made =
		check === null
			? plan(reply, null, true)
			: checkFound(check)
				? plan(applyCheck(reply, check), check.tooShort ? { keepOut: check.dropSentences } : null)
				: first
	return {
		kind: 'plan',
		...made,
		music,
		musicAvailable,
		videoColour,
		problems: check?.problems ?? null
	} as const
}
