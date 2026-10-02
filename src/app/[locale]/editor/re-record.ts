import type { Edit } from './cleanup'
import type { SplicePlan } from './sentence-splice'
import type { Clip, Replacement, SourceRange } from './sequence'
import {
	analysisSamples,
	ANALYSIS_SAMPLE_RATE,
	decodeAudio,
	measureLoudness,
	SILENCE_THRESHOLD_DB,
	type Loudness
} from './take-audio'

// Re-recording a sentence: the user says it again into the mic, and the new
// take is heard over the original's span instead of its sound (sequence.ts
// plays it). The take is trimmed to its speech plus as much quiet as the
// original span kept, and brought to the original's level with one gain.
// All of it runs in the browser: no AI call, nothing uploaded.

/** A recorded take, ready to play over its span. */
export type ReplacementTake = Replacement & {
	id: string
	/** The whole recording; what plays is `takeSeconds` of it from `offsetSeconds`. */
	audio: AudioBuffer
	offsetSeconds: number
	/** Linear gain that brings the take's speech to the original's level. */
	gain: number
}

/** The most the take's level is moved: past this it's a bad take, not a quiet one. */
const MAX_GAIN_DB = 12
/** "How loud the speech is": the level that 90% of its 10 ms windows stay under. */
const LEVEL_PERCENTILE = 0.9

/**
 * The end of every recording holds the press of Stop: the mic hears the
 * button's click at mouse-down (a full-scale spike in a real take), and the
 * recording ends at mouse-up just after. This much at the end is never
 * taken as speech, nor played.
 */
const STOP_PRESS_SECONDS = 0.3

/**
 * A recording's speech, before the press of Stop: from its first to its
 * last window above both its own gap threshold and the absolute silence
 * line. The relative threshold alone sinks below the noise floor when a
 * recording has no speech at all.
 */
export function speechRange(loudness: Loudness): SourceRange | null {
	const { db, windowSeconds, gapThresholdDb } = loudness
	const threshold = Math.max(gapThresholdDb, SILENCE_THRESHOLD_DB)
	const beforeStop = db.subarray(
		0,
		Math.max(0, db.length - Math.round(STOP_PRESS_SECONDS / windowSeconds))
	)
	const first = beforeStop.findIndex((level) => level >= threshold)
	if (first < 0) return null
	const last = beforeStop.findLastIndex((level) => level >= threshold)
	return { startSeconds: first * windowSeconds, endSeconds: (last + 1) * windowSeconds }
}

/**
 * The part of a take that plays: its speech with the same quiet either side
 * that the original span kept around the sentence, so the pauses at the
 * joins stay as they were. Null when nothing in the recording was speech.
 */
export function takeRange(
	loudness: Loudness,
	plan: Extract<SplicePlan, { kind: 'splice' }>,
	recordingSeconds: number
): SourceRange | null {
	const speech = speechRange(loudness)
	if (!speech) return null
	return {
		startSeconds: Math.max(0, speech.startSeconds - (plan.speech.startSeconds - plan.startSeconds)),
		endSeconds: Math.min(
			recordingSeconds - STOP_PRESS_SECONDS,
			speech.endSeconds + (plan.endSeconds - plan.speech.endSeconds)
		)
	}
}

/** How loud the speech in a range is, in dBFS. */
export function speechLevelDb(loudness: Loudness, range: SourceRange): number {
	const { db, windowSeconds } = loudness
	const windows = Float32Array.from(
		db.subarray(
			Math.floor(range.startSeconds / windowSeconds),
			Math.ceil(range.endSeconds / windowSeconds)
		)
	).sort()
	return windows[Math.floor(LEVEL_PERCENTILE * (windows.length - 1))] ?? -Infinity
}

/** The linear gain that brings a take's speech level to the original's, within ±MAX_GAIN_DB. */
export function matchingGain(originalDb: number, takeDb: number): number {
	const db = Math.min(MAX_GAIN_DB, Math.max(-MAX_GAIN_DB, originalDb - takeDb))
	return 10 ** (db / 20)
}

/**
 * Turns a mic recording into a take for `plan`'s span, matched to the
 * original take's level — or null when no speech was heard in it.
 * Browser-only.
 */
export async function prepareTake(
	recording: Blob,
	plan: Extract<SplicePlan, { kind: 'splice' }>,
	original: Loudness
): Promise<ReplacementTake | null> {
	const audio = await decodeAudio(recording)
	// The browser recorded it, so it can decode it; failing to is a bug.
	if (!audio) throw new Error('the browser could not decode its own recording')
	const loudness = measureLoudness(await analysisSamples(audio), ANALYSIS_SAMPLE_RATE)
	const speech = speechRange(loudness)
	const range = takeRange(loudness, plan, audio.duration)
	if (!speech || !range) return null
	return {
		id: crypto.randomUUID(),
		span: { startSeconds: plan.startSeconds, endSeconds: plan.endSeconds },
		takeSeconds: range.endSeconds - range.startSeconds,
		audio,
		offsetSeconds: range.startSeconds,
		gain: matchingGain(speechLevelDb(original, plan.speech), speechLevelDb(loudness, speech))
	}
}

/** How much of the take either side of the sentence its preview plays. */
const PREVIEW_CONTEXT_SECONDS = 1

/** What a re-record preview plays: the span plus context, inside the take. */
export function previewWindow(span: SourceRange, durationSeconds: number): SourceRange {
	return {
		startSeconds: Math.max(0, span.startSeconds - PREVIEW_CONTEXT_SECONDS),
		endSeconds: Math.min(durationSeconds, span.endSeconds + PREVIEW_CONTEXT_SECONDS)
	}
}

export type ReRecordBlocker = 'no_gap_before' | 'no_gap_after' | 'trimmed' | 'split' | 'overlaps'

/**
 * Why a sentence can't be re-recorded right now, or null if it can: no
 * clean pause to join in, or a span the edit doesn't play in one piece —
 * trimmed into, divided between clips, or overlapping another
 * re-recorded sentence. Re-recording the same span again is fine: the new
 * take replaces the old one.
 */
export function reRecordBlocker(
	plan: SplicePlan,
	edit: Edit,
	clips: Clip[],
	replacements: readonly Replacement[]
): ReRecordBlocker | null {
	if (plan.kind === 'review') return plan.reason
	const inside = (outer: SourceRange) =>
		plan.startSeconds >= outer.startSeconds && plan.endSeconds <= outer.endSeconds
	if (!inside(edit.trim)) return 'trimmed'
	if (!clips.some((clip) => clip.ranges.some(inside))) return 'split'
	const overlaps = replacements.some(
		({ span }) =>
			span.startSeconds < plan.endSeconds &&
			span.endSeconds > plan.startSeconds &&
			!(span.startSeconds === plan.startSeconds && span.endSeconds === plan.endSeconds)
	)
	return overlaps ? 'overlaps' : null
}
