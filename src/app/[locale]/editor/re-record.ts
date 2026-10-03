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
	/** How long it fades in at its start and out at its end; 0 for none. */
	fadeSeconds: number
}

/**
 * A take whose joins were set by ear starts and ends inside speech: cut
 * there, it stops dead mid-waveform (a real one ended at -26 dB, dropping
 * 0.044 to 0 in one sample: a click). Fading its edges this long removes
 * the step without a dip you'd hear between words. A take between two
 * pauses starts and ends on room tone, and its seams measured clean, so it
 * isn't faded.
 */
export const JOIN_FADE_SECONDS = 0.01

/** The scheduling half of an AudioParam, so a take's envelope can be set (and tested) without Web Audio. */
type GainSchedule = {
	setValueAtTime: (value: number, at: number) => unknown
	linearRampToValueAtTime: (value: number, at: number) => unknown
}

/**
 * Sets a take's level from `at` (audio clock seconds) as it plays from
 * `intoSeconds` into it at `rate`: its matching gain, faded in over
 * fadeSeconds from its start and out over fadeSeconds to its end. Starting
 * partway in picks the envelope up where it would be.
 */
export function scheduleTakeGain(
	param: GainSchedule,
	take: Pick<ReplacementTake, 'gain' | 'fadeSeconds' | 'takeSeconds'>,
	at: number,
	intoSeconds: number,
	rate: number
) {
	const { gain, fadeSeconds: fade, takeSeconds } = take
	if (fade <= 0) {
		param.setValueAtTime(gain, at)
		return
	}
	// Envelope level at a point in the take, and the audio-clock time it plays at.
	const levelAt = (seconds: number) =>
		gain * Math.min(1, seconds / fade, Math.max(0, (takeSeconds - seconds) / fade))
	const when = (seconds: number) => at + (seconds - intoSeconds) / rate
	param.setValueAtTime(levelAt(intoSeconds), at)
	if (intoSeconds < fade) param.linearRampToValueAtTime(levelAt(fade), when(fade))
	const fadeOutFrom = Math.max(intoSeconds, fade, takeSeconds - fade)
	param.setValueAtTime(levelAt(fadeOutFrom), when(fadeOutFrom))
	param.linearRampToValueAtTime(0, when(takeSeconds))
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
 * A recording's windows before the press of Stop, and the level that counts
 * as speech in them: above both its own gap threshold and the absolute
 * silence line. The relative threshold alone sinks below the noise floor
 * when a recording has no speech at all.
 */
function beforeStop({ db, windowSeconds, gapThresholdDb }: Loudness) {
	return {
		windows: db.subarray(
			0,
			Math.max(0, db.length - Math.round(STOP_PRESS_SECONDS / windowSeconds))
		),
		threshold: Math.max(gapThresholdDb, SILENCE_THRESHOLD_DB)
	}
}

/** A recording's speech, before the press of Stop: from its first to its last loud window. */
export function speechRange(loudness: Loudness): SourceRange | null {
	const { windows, threshold } = beforeStop(loudness)
	const first = windows.findIndex((level) => level >= threshold)
	if (first < 0) return null
	const last = windows.findLastIndex((level) => level >= threshold)
	return {
		startSeconds: first * loudness.windowSeconds,
		endSeconds: (last + 1) * loudness.windowSeconds
	}
}

/**
 * Whether Stop was pressed so soon that the speech was still going where
 * the press begins: the take would end mid-word, which a real take did,
 * as a click at the join. Such a take is recorded again, not cut.
 */
export function stoppedMidSpeech(loudness: Loudness): boolean {
	const { windows, threshold } = beforeStop(loudness)
	return (windows.at(-1) ?? -Infinity) >= threshold
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

/** The input meter reads empty at this level and below, full at 0 dBFS. */
const METER_FLOOR_DB = -60

/** How full the input meter is (0-100) for a block of mic samples: their RMS on a dB scale. */
export function inputLevelPercent(samples: Float32Array): number {
	let sumOfSquares = 0
	for (const sample of samples) sumOfSquares += sample * sample
	const rms = Math.sqrt(sumOfSquares / Math.max(1, samples.length))
	if (rms === 0) return 0
	const db = 20 * Math.log10(rms)
	return Math.round(Math.min(100, Math.max(0, (1 - db / METER_FLOOR_DB) * 100)))
}

/**
 * Turns a mic recording into a take for `plan`'s span, matched to the
 * original take's level — or why it can't be one: no speech was heard in
 * it, or Stop cut the speech off. Browser-only.
 */
export async function prepareTake(
	recording: Blob,
	plan: Extract<SplicePlan, { kind: 'splice' }>,
	original: Loudness
): Promise<ReplacementTake | 'no_speech' | 'stopped_mid_speech'> {
	const audio = await decodeAudio(recording)
	// The browser recorded it, so it can decode it; failing to is a bug.
	if (!audio) throw new Error('the browser could not decode its own recording')
	const loudness = measureLoudness(await analysisSamples(audio), ANALYSIS_SAMPLE_RATE)
	const speech = speechRange(loudness)
	const range = takeRange(loudness, plan, audio.duration)
	if (!speech || !range) return 'no_speech'
	if (stoppedMidSpeech(loudness)) return 'stopped_mid_speech'
	return {
		id: crypto.randomUUID(),
		span: { startSeconds: plan.startSeconds, endSeconds: plan.endSeconds },
		takeSeconds: range.endSeconds - range.startSeconds,
		audio,
		offsetSeconds: range.startSeconds,
		fadeSeconds: plan.byEar ? JOIN_FADE_SECONDS : 0,
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

export type ReRecordBlocker =
	'no_gap_before' | 'no_gap_after' | 'trimmed' | 'split' | 'overlaps' | 'sped'

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
	const clip = clips.find((c) => c.ranges.some(inside))
	if (!clip) return 'split'
	// A take can't keep pace with a sped-up or slowed picture and keep its pitch.
	if ((clip.speed ?? 1) !== 1) return 'sped'
	const overlaps = replacements.some(
		({ span }) =>
			span.startSeconds < plan.endSeconds &&
			span.endSeconds > plan.startSeconds &&
			!(span.startSeconds === plan.startSeconds && span.endSeconds === plan.endSeconds)
	)
	return overlaps ? 'overlaps' : null
}
