import type { TranscriptSegment } from '../../editor/audio/transcript'
import {
	type Clip,
	editedLength,
	playableSegments,
	type SourceRange
} from '../../editor/model/sequence'
import { type TransitionKind, transitionLimit } from '../../editor/model/transitions'
import {
	DEFAULT_AD_SECONDS,
	type MakeChoices,
	namesLength,
	namesLengthChange
} from './make-questions'
import type { MakeReply } from './make-reply'
import {
	ASKED_FILL,
	isShortForm,
	SHORT_FORM_MAX_SECONDS,
	SHORT_FORM_TARGET_SECONDS
} from './make-request'
import type {
	AskedLength,
	CutBasis,
	LengthLimits,
	MakeInput,
	MakeSummary,
	Opener
} from './make-context'

// What a Make it plan keeps of the recording, and how long the edit runs.

/** Room left around speech where a pause is cut: from the pause only, never a word. */
const SPEECH_PADDING_SECONDS = 0.25
/** A pause longer than this between kept sentences is cut down (talking videos only). */
const LONG_PAUSE_SECONDS = 0.8
/** Pieces shorter than this aren't worth keeping as a clip of their own. */
export const MIN_PIECE_SECONDS = 0.3
/** At least this much removed between two clips makes a jump worth a transition. */
const TRANSITION_GAP_SECONDS = 1.5
const TRANSITION_SECONDS: Record<TransitionKind, number> = { fade: 0.5, dissolve: 0.4, slide: 0.4 }
/** Transitions used sparingly: at the few joins where the most was taken out. */
const MAX_TRANSITIONS = 3

export const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value))
export const overlaps = (a: SourceRange, b: SourceRange) =>
	a.startSeconds < b.endSeconds && a.endSeconds > b.startSeconds

/** Sentence numbers (from 1) that exist, as indexes, each once. */
function sentenceIndexes(numbers: readonly number[], count: number): Set<number> {
	return new Set(numbers.map((n) => n - 1).filter((index) => index >= 0 && index < count))
}

/** Sentence `index` with room around it, into the pauses either side but never into the next words. */
function padded(
	sentence: TranscriptSegment,
	index: number,
	sentences: readonly TranscriptSegment[],
	duration: number
): SourceRange {
	const before = sentences[index - 1]?.endSeconds ?? 0
	const after = sentences[index + 1]?.startSeconds ?? duration
	return {
		startSeconds: Math.min(
			sentence.startSeconds,
			Math.max(before, sentence.startSeconds - SPEECH_PADDING_SECONDS)
		),
		endSeconds: Math.max(
			sentence.endSeconds,
			Math.min(after, sentence.endSeconds + SPEECH_PADDING_SECONDS)
		)
	}
}

/** Ranges joined where they touch or overlap, in order. */
function merged(ranges: SourceRange[]): SourceRange[] {
	const out: SourceRange[] = []
	for (const range of [...ranges].sort((a, b) => a.startSeconds - b.startSeconds)) {
		const last = out.at(-1)
		if (last && range.startSeconds <= last.endSeconds) {
			last.endSeconds = Math.max(last.endSeconds, range.endSeconds)
		} else out.push({ ...range })
	}
	return out
}

/** What's left of `whole` once `removed` is taken out. */
export function without(whole: SourceRange, removed: SourceRange[]): SourceRange[] {
	const kept: SourceRange[] = []
	let from = whole.startSeconds
	for (const cut of merged(removed)) {
		if (cut.startSeconds >= whole.endSeconds) break
		if (cut.startSeconds > from) kept.push({ startSeconds: from, endSeconds: cut.startSeconds })
		from = Math.max(from, cut.endSeconds)
	}
	if (from < whole.endSeconds) kept.push({ startSeconds: from, endSeconds: whole.endSeconds })
	return kept
}

/**
 * The parts of the video kept, in order. A talking video (the picture
 * doesn't matter) keeps its kept sentences with a little room each side, so
 * dead air between them goes. A video whose picture matters keeps
 * everything except the sentences and stretches named as dead, a stretch
 * never cutting into a kept sentence's words. Removing everything removes
 * nothing.
 */
export function keptRanges(
	reply: Pick<MakeReply, 'pictureMatters' | 'removeSentences' | 'removeSpans'>,
	sentences: readonly TranscriptSegment[],
	durationSeconds: number
): SourceRange[] {
	const whole = { startSeconds: 0, endSeconds: durationSeconds }
	let removed = sentenceIndexes(reply.removeSentences, sentences.length)
	if (removed.size === sentences.length) removed = new Set()
	const all = sentences.map((sentence, index) => ({
		index,
		pause: sentence.startSeconds - (sentences[index - 1]?.endSeconds ?? 0),
		range: padded(sentence, index, sentences, durationSeconds)
	}))
	const keptOnes = all.filter(({ index }) => !removed.has(index))
	const keptSentences = keptOnes.map(({ range }) => range)
	let kept: SourceRange[] = []
	if (!reply.pictureMatters && keptOnes.length > 0) {
		// Sentences one after the other stay together across a short pause; a
		// long one, or a sentence taken out between them, starts a new piece.
		let previous = -1
		for (const { index, pause, range } of keptOnes) {
			const last = kept.at(-1)
			if (last && previous === index - 1 && pause <= LONG_PAUSE_SECONDS) {
				last.endSeconds = range.endSeconds
			} else kept.push({ ...range })
			previous = index
		}
	} else {
		const spans = reply.removeSpans
			.map((span) => ({
				startSeconds: clamp(Math.min(span.startSeconds, span.endSeconds), 0, durationSeconds),
				endSeconds: clamp(Math.max(span.startSeconds, span.endSeconds), 0, durationSeconds)
			}))
			.flatMap((span) => without(span, keptSentences))
		const removedSentences = all.filter(({ index }) => removed.has(index)).map(({ range }) => range)
		kept = without(whole, [...removedSentences, ...spans])
	}
	kept = kept.filter((range) => range.endSeconds - range.startSeconds >= MIN_PIECE_SECONDS)
	return kept.length > 0 ? kept : [whole]
}

/** A range split where it meets `part`: what's before it, the part, what's after (slivers dropped). */
function around(range: SourceRange, part: SourceRange): SourceRange[] {
	if (!overlaps(range, part)) return [range]
	const start = Math.max(range.startSeconds, part.startSeconds)
	const end = Math.min(range.endSeconds, part.endSeconds)
	return [
		{ startSeconds: range.startSeconds, endSeconds: start },
		{ startSeconds: start, endSeconds: end },
		{ startSeconds: end, endSeconds: range.endSeconds }
	].filter(
		(piece, index) => index === 1 || piece.endSeconds - piece.startSeconds >= MIN_PIECE_SECONDS
	)
}

/** The first `seconds` of the kept ranges, in play order: the last one cut short. */
function firstSeconds(kept: SourceRange[], seconds: number): SourceRange[] {
	const out: SourceRange[] = []
	let left = seconds
	for (const range of kept) {
		if (left < MIN_PIECE_SECONDS) break
		const length = Math.min(range.endSeconds - range.startSeconds, left)
		out.push({ startSeconds: range.startSeconds, endSeconds: range.startSeconds + length })
		left -= length
	}
	return out
}

/**
 * The sentences (indexes) a short-form edit is made of: whole moments, best
 * first, each taken only if it still fits under `fits`, then single
 * sentences in order, until `enough` says it's long enough. Dead sentences
 * never; a moment that overlaps one taken before, never. Starts from
 * `start` (none, unless an edit is being lengthened).
 */
export function chooseSentences(
	moments: MakeReply['moments'],
	count: number,
	dead: ReadonlySet<number>,
	fits: (chosen: ReadonlySet<number>) => { fits: boolean; enough: boolean },
	start: ReadonlySet<number> = new Set()
): Set<number> {
	const runs = moments
		.map(({ first, last }) => ({ from: Math.min(first, last) - 1, to: Math.max(first, last) - 1 }))
		.filter(({ from, to }) => from >= 0 && to < count)
		.map(({ from, to }) =>
			Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((i) => !dead.has(i))
		)
	const singles = Array.from({ length: count }, (_, i) => [i]).filter(([i]) => !dead.has(i ?? -1))
	let chosen = new Set(start)
	for (const run of [...runs, ...singles]) {
		if (run.length === 0 || run.some((i) => chosen.has(i))) continue
		const trial = new Set([...chosen, ...run])
		const result = fits(trial)
		if (!result.fits) continue
		chosen = trial
		if (result.enough) break
	}
	return chosen
}

/** A cut: what's kept, as clips, with the filler cuts in it, its joins and how long it plays. */
export type MadeCut = ReturnType<typeof cutEdit>

/**
 * The cut with these sentences (numbered from 1) taken out, at most `cap`
 * seconds of source, and the piece holding sentence `opener` (an index)
 * moved to the start.
 */
export function cutEdit(
	basis: CutBasis,
	removeSentences: number[],
	cap: number | null = null,
	opener: Opener | null = null
) {
	const { reply, sentences, durationSeconds, pictureMatters, transition } = basis
	const whole = { startSeconds: 0, endSeconds: durationSeconds }
	const ranges = keptRanges(
		{ ...reply, removeSentences, pictureMatters },
		sentences,
		durationSeconds
	)
	const timeOrder = cap === null ? ranges : firstSeconds(ranges, cap)
	// The opening moment, cut out of the piece it's in (at the pauses
	// around it) and moved to the start.
	const from = opener ? sentences[opener.from] : undefined
	const to = opener ? sentences[opener.to] : undefined
	const moment =
		opener && from && to
			? {
					startSeconds: padded(from, opener.from, sentences, durationSeconds).startSeconds,
					endSeconds: padded(to, opener.to, sentences, durationSeconds).endSeconds
				}
			: null
	const pieces = moment ? timeOrder.flatMap((range) => around(range, moment)) : timeOrder
	const opening = moment
		? pieces.find(
				(range) =>
					range.startSeconds >= moment.startSeconds && range.endSeconds <= moment.endSeconds
			)
		: undefined
	const kept = opening ? [opening, ...pieces.filter((range) => range !== opening)] : pieces
	const clips: Clip[] = kept.map((range, index) => ({ id: `make-${index + 1}`, ranges: [range] }))
	const cuts = basis.fillerCuts.filter((cut) => kept.some((range) => overlaps(range, cut)))
	const joins = transitionJoins(clips, transition, basis.look.transition.seconds, true)
	const segments = playableSegments(clips, { trim: whole, cuts })
	const transitions =
		transition === 'zoom_cut' ? joins.length : clips.filter((clip) => clip.transition).length
	return {
		kept,
		clips,
		cuts,
		joins,
		transitions,
		segments,
		editedSeconds: editedLength(segments)
	}
}

/**
 * Joins where a real stretch was taken out (or the order jumps), the most
 * taken out first: only the first few get a transition. A fade, dissolve or
 * slide is set on each (as long as both clips have room for half of it),
 * `seconds` long (each kind's own length when not given), a fade or
 * dissolve eased when `eased` (a slide eases already); returns the joins
 * (the index of the clip after), for zoom cuts too.
 */
export function transitionJoins(
	clips: Clip[],
	transition: MakeReply['transition'],
	seconds?: number,
	eased = false
): number[] {
	const joins = clips
		.flatMap((clip, index) => {
			const prior = clips[index - 1]?.ranges.at(-1)
			const [range] = clip.ranges
			if (!prior || !range) return []
			const gap = range.startSeconds - prior.endSeconds
			const jump = gap < 0 ? Number.POSITIVE_INFINITY : gap
			return jump >= TRANSITION_GAP_SECONDS ? [{ index, jump }] : []
		})
		.sort((a, b) => b.jump - a.jump)
		.slice(0, MAX_TRANSITIONS)
		.map(({ index }) => index)
	const kind = transition
	if (kind === 'fade' || kind === 'dissolve' || kind === 'slide') {
		for (const index of joins) {
			const clip = clips[index]
			const before = clips[index - 1]
			const range = clip?.ranges[0]
			const prior = before?.ranges.at(-1)
			if (!clip || !before || !range || !prior) continue
			const limit = transitionLimit(
				prior.endSeconds - prior.startSeconds,
				range.endSeconds - range.startSeconds
			)
			const wanted = seconds ?? TRANSITION_SECONDS[kind]
			const length = Math.min(wanted, limit)
			if (length >= wanted / 2) {
				clip.transition = {
					kind,
					seconds: length,
					after: before.id,
					...(eased && kind !== 'slide' && { eased: true })
				}
			}
		}
	}
	return joins
}

/**
 * Short-form opens with its strongest moment, and, when it runs over a
 * minute, is made of whole moments (best first, then single sentences)
 * chosen to fill 50 to 59 seconds. Whatever still runs over (one long
 * sentence, a stretch with no speech) keeps only its first part. Filler
 * cuts and overlapping transitions only ever make it shorter. A length
 * asked for (in the request, or a follow-up) limits it further (any edit),
 * and is what it fills towards; it is never called short.
 */
export function lengthLimits(
	reply: Pick<MakeReply, 'format' | 'maxSeconds'>,
	request: string
): LengthLimits {
	const shortForm = isShortForm(reply.format, request)
	const asked = reply.maxSeconds
	const limitSeconds =
		asked !== null
			? Math.min(asked, shortForm ? SHORT_FORM_MAX_SECONDS : Number.POSITIVE_INFINITY)
			: shortForm
				? SHORT_FORM_MAX_SECONDS
				: null
	const target = asked !== null ? (limitSeconds ?? asked) * ASKED_FILL : SHORT_FORM_TARGET_SECONDS
	return { shortForm, asked, limitSeconds, target }
}

/**
 * The most the plan may run, from the user's own words only (Gemini fills a
 * length in whether or not anyone asked). The latest ask wins: a follow-up
 * naming a length, or asking it shorter or longer (Gemini's number for it);
 * else the length clicked; else one the request states (Gemini's reading of
 * it). Left to "You decide", an ad runs at most DEFAULT_AD_SECONDS and a
 * reel, TikTok or Short keeps its own under-a-minute rule, chosen for the
 * user. Nothing asked and no question shown: no length at all. It's only
 * ever a most: a shorter video stays as it is.
 */
export function askedLength(
	reply: Pick<MakeReply, 'maxSeconds' | 'style' | 'format'>,
	request: string,
	choices: MakeChoices | null | undefined,
	followUps: readonly string[] = []
): AskedLength {
	if (followUps.some((text) => namesLength(text) || namesLengthChange(text))) {
		return { seconds: reply.maxSeconds, said: true }
	}
	if (choices?.length) return { seconds: Number(choices.length), said: true }
	if (namesLength(request)) return { seconds: reply.maxSeconds, said: true }
	const decided = choices?.asked.includes('length') ?? false
	const ad = reply.style === 'ad' && !isShortForm(reply.format, request)
	return { seconds: decided && ad ? DEFAULT_AD_SECONDS : null, said: false }
}

/** The strongest moment (the reply's first), which a short-form edit opens with; null otherwise. */
export function openingMoment(
	moments: MakeReply['moments'],
	count: number,
	shortForm: boolean
): Opener | null {
	const strongest = moments[0]
	return shortForm && strongest
		? {
				from: Math.min(strongest.first, strongest.last) - 1,
				to: Math.min(Math.max(strongest.first, strongest.last), count) - 1
			}
		: null
}

/** The sentence numbers (from 1) to take out so only `chosen` (indexes) stay. */
const allBut = (sentences: readonly TranscriptSegment[], chosen: ReadonlySet<number>) =>
	sentences.flatMap((_, index) => (chosen.has(index) ? [] : [index + 1]))

/** A cut, and the sentences taken out to make it. */
export type FittedCut = {
	removeSentences: number[]
	cut: MadeCut
	trimmedToFit: boolean
}

/**
 * The reply's cut, and when it runs over the limit, the one made of whole
 * moments (then single sentences, never dead ones) that fits and fills
 * towards the target; still over, it keeps only its first part.
 */
export function fitToLimit(
	basis: CutBasis,
	limits: LengthLimits,
	opener: Opener | null
): FittedCut {
	const { reply, sentences } = basis
	const { limitSeconds, target } = limits
	const dead = sentenceIndexes(reply.removeSentences, sentences.length)
	let removeSentences = reply.removeSentences
	let cut = cutEdit(basis, removeSentences, null, opener)
	let trimmedToFit = false
	if (limitSeconds !== null && cut.editedSeconds > limitSeconds) {
		trimmedToFit = true
		const chosen = chooseSentences(reply.moments, sentences.length, dead, (trial) => {
			const length = cutEdit(basis, allBut(sentences, trial), null, opener).editedSeconds
			return { fits: length <= limitSeconds, enough: length >= target }
		})
		if (chosen.size > 0) removeSentences = allBut(sentences, chosen)
		cut = cutEdit(basis, removeSentences, null, opener)
		if (cut.editedSeconds > limitSeconds)
			cut = cutEdit(basis, removeSentences, limitSeconds, opener)
	}
	return { removeSentences, cut, trimmedToFit }
}

/**
 * Too short, the check said: a short-form edit takes back sentences the
 * plan had left out (its moments first, then in order, never the check's
 * own drops), until it fills 50 seconds or nothing more fits.
 */
export function lengthenForCheck(
	basis: CutBasis,
	fitted: FittedCut,
	limits: LengthLimits,
	tooShort: MakeInput<unknown>['tooShort'],
	opener: Opener | null
): FittedCut & { lengthened: boolean } {
	const { reply, sentences } = basis
	const { asked, limitSeconds } = limits
	let { removeSentences, cut } = fitted
	let lengthened = false
	if (
		asked === null &&
		limitSeconds !== null &&
		tooShort &&
		cut.editedSeconds < SHORT_FORM_TARGET_SECONDS &&
		sentences.length > 0
	) {
		const keepOut = sentenceIndexes(tooShort.keepOut, sentences.length)
		const removed = sentenceIndexes(removeSentences, sentences.length)
		const inIt = new Set(sentences.flatMap((_, index) => (removed.has(index) ? [] : [index])))
		const chosen = chooseSentences(
			reply.moments,
			sentences.length,
			keepOut,
			(trial) => {
				const length = cutEdit(basis, allBut(sentences, trial), null, opener).editedSeconds
				return { fits: length <= limitSeconds, enough: length >= SHORT_FORM_TARGET_SECONDS }
			},
			inIt
		)
		if (chosen.size > inIt.size) {
			const longer = cutEdit(basis, allBut(sentences, chosen), null, opener)
			if (longer.editedSeconds > cut.editedSeconds) {
				removeSentences = allBut(sentences, chosen)
				cut = longer
				lengthened = true
			}
		}
	}
	return { removeSentences, cut, trimmedToFit: fitted.trimmedToFit, lengthened }
}

/**
 * Whether the plan is still short: a reel, TikTok or Short under 50 s of a
 * video that runs longer, or (no limit) shorter than the check says the
 * request wants. Never with a length asked for. Rounded as the plan shows
 * it, so "50 seconds" is never called short.
 */
export function shortLabel(
	limits: Pick<LengthLimits, 'asked' | 'limitSeconds'>,
	editedSeconds: number,
	durationSeconds: number,
	tooShort: MakeInput<unknown>['tooShort']
): MakeSummary['short'] {
	const { asked, limitSeconds } = limits
	return asked !== null
		? null
		: limitSeconds !== null
			? Math.round(editedSeconds) < SHORT_FORM_TARGET_SECONDS &&
				durationSeconds >= SHORT_FORM_TARGET_SECONDS
				? 'short_form'
				: null
			: tooShort
				? 'asked'
				: null
}
