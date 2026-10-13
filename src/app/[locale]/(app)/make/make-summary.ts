import type { TranscriptSegment } from '../../editor/audio/transcript'
import type { Clip } from '../../editor/model/sequence'
import { LENGTH, type MakeChoices } from './make-questions'
import type { Preset } from './make-presets'
import type { CaptionLook, MakeFit, MakeReply, MakeShape } from './make-reply'
import { saidInBrief } from './make-request'
import type {
	LengthLimits,
	MakeSummary,
	MusicTrack,
	Opener,
	PlanContext,
	PlannedEdit
} from './make-context'
import { type FittedCut, overlaps, without } from './make-cut'

// What a Make it plan says about itself: the plan card's facts, what changed between two plans, and the plan described for the check.

/** A length that is the result's: "to 55 seconds", "now 0:55", "a 55-second reel", "55 s long". */
const RESULT_LENGTH = new RegExp(
	String.raw`(\b(?:to|into|now|is|of|runs|running)\s+(?:(?:about|around|roughly|just|under|over|a|an)\s+)*)(?:${LENGTH})|(?:${LENGTH})(?=\s*(?:long|reels?|videos?|edits?|shorts?)\b)`,
	'giu'
)

/**
 * The summary with any length it gives the result put right. Gemini writes
 * the summary before the edit is cut to fit (and before the check's fixes),
 * so the length it names can be a plan's guess ("to 55 seconds" for an edit
 * of 50). Only a length said of the result changes, to the edit's own
 * rounded as the plan shows it; the original's length and the lengths of
 * parts cut are left as they are.
 */
export function summaryWithLength(summary: string, editedSeconds: number): string {
	const real = Math.round(editedSeconds)
	return summary.replace(RESULT_LENGTH, (whole, lead: string | undefined, ...groups: unknown[]) => {
		const [m1, s1, n1, gap1, unit1, m2, s2, n2, gap2, unit2] = groups as Array<string | undefined>
		const minutes = m1 ?? m2
		const seconds = s1 ?? s2
		const number = n1 ?? n2
		const gap = gap1 ?? gap2 ?? ' '
		const unit = (unit1 ?? unit2 ?? '').toLowerCase()
		const said =
			minutes !== undefined
				? Number(minutes) * 60 + Number(seconds)
				: Number(number) * (unit.startsWith('m') ? 60 : 1)
		if (Math.abs(said - editedSeconds) < 1) return whole
		const length =
			minutes !== undefined || unit.startsWith('m')
				? `${Math.floor(real / 60)}:${String(real % 60).padStart(2, '0')}`
				: `${real}${gap}${unit1 ?? unit2}`
		return `${lead ?? ''}${length}`
	})
}

/**
 * What the plan does, in words for the person deciding whether to apply it:
 * its length and what was cut, its shape and treatment, what's on screen,
 * and which parts of a brief were the user's own words (Gemini fills a
 * brief in whether or not anyone asked).
 */
export function planSummary<Sound>(
	context: Pick<
		PlanContext,
		'reply' | 'durationSeconds' | 'sentences' | 'transition' | 'said' | 'promo' | 'pictureMatters'
	>,
	{
		limits,
		made,
		short,
		opener,
		captions,
		edit,
		callToAction,
		titleDropped,
		music,
		musicAvailable,
		shape,
		screen,
		choices,
		lengthSaid,
		look
	}: {
		limits: LengthLimits
		made: FittedCut & { lengthened: boolean }
		short: MakeSummary['short']
		opener: Opener | null
		captions: CaptionLook
		edit: Pick<PlannedEdit<Sound>, 'autoZooms' | 'autoTitles' | 'audioItems' | 'title' | 'design'>
		callToAction: string | null
		titleDropped: boolean
		music: MusicTrack<Sound> | null
		musicAvailable: boolean
		shape: MakeSummary['shape']
		screen: MakeSummary['screen']
		/** The answers to the quick questions, when they were shown. */
		choices?: MakeChoices | null
		/** The length came from the user's own words: typed, clicked, or a follow-up. */
		lengthSaid: boolean
		/** The look, and whether the user's words or a click chose it. */
		look: MakeSummary['look']
	}
): MakeSummary {
	const { reply, durationSeconds, sentences, transition, said, promo, pictureMatters } = context
	const { kept, cuts, joins, transitions, editedSeconds } = made.cut
	const { autoZooms, autoTitles, audioItems, title, design } = edit
	const whole = { startSeconds: 0, endSeconds: durationSeconds }
	const keptSentences = sentences.filter((sentence) =>
		kept.some((range) => overlaps(range, sentence))
	).length
	const opening = opener === null ? null : (sentences[opener.from]?.text ?? null)
	const making = reply.format === 'other' ? reply.style : reply.format
	const asked = new Set(choices?.asked ?? [])
	return {
		style: reply.style,
		making,
		summary: summaryWithLength(reply.summary, editedSeconds),
		limitSeconds: limits.limitSeconds,
		maxSeconds: limits.asked,
		trimmedToFit: made.trimmedToFit,
		lengthened: made.lengthened,
		short,
		keptSentences,
		totalSentences: sentences.length,
		originalSeconds: durationSeconds,
		editedSeconds,
		removedParts: without(whole, kept).length,
		fillerCuts: cuts.length,
		captions,
		keyLines: autoTitles.length - (callToAction ? 1 : 0),
		// Said when it moved: the strongest line opens, before what came first in the video.
		opensWith: (kept[0]?.startSeconds ?? 0) > (kept[1]?.startSeconds ?? Infinity) ? opening : null,
		zooms: autoZooms.length - (transition === 'zoom_cut' ? joins.length : 0),
		transition,
		transitions,
		music: audioItems.length > 0 ? (music?.name ?? null) : null,
		musicMissing: !musicAvailable,
		shape,
		screen,
		brief: {
			audience: reply.brief.audience,
			tone: reply.brief.tone,
			show: reply.brief.show,
			lengthSeconds: limits.asked,
			callToAction,
			// Like the treatment: only the user's own words make a part theirs.
			said: {
				audience: saidInBrief(reply.brief.audience ?? '', said),
				tone: saidInBrief(reply.brief.tone ?? '', said),
				show: saidInBrief(reply.brief.show ?? '', said),
				lengthSeconds: lengthSaid,
				callToAction: saidInBrief(callToAction ?? '', said)
			},
			chosenFor: promo ? 'promo' : 'you'
		},
		card: design?.picture ?? null,
		title: title?.text ?? null,
		titleDropped,
		pictureMatters,
		cannotDo: reply.cannotDo,
		look,
		// Only the questions shown, each the user's when picked, chosen for them when not.
		...(choices && {
			questions: {
				...(asked.has('kind') && {
					kind: { value: choices.kind === 'other' ? 'other' : making, said: choices.kind !== null }
				}),
				...(asked.has('adShape') && {
					shape: { value: shape.target, said: choices.adShape !== null }
				})
			}
		})
	}
}

/** One way a follow-up's plan differs from the plan before it, for the chat to say. */
export type PlanChange =
	| {
			kind: 'length' | 'sentences' | 'keyLines' | 'zooms' | 'transitions'
			from: number
			to: number
	  }
	| { kind: 'captions'; from: CaptionLook; to: CaptionLook }
	| { kind: 'look'; from: Preset; to: Preset }
	| { kind: 'shape'; from: MakeShape; to: MakeShape }
	| { kind: 'fit'; from: FitLabel; to: FitLabel }
	| { kind: 'title' | 'music'; from: string | null; to: string | null }

/** How the video goes into its shape, as a follow-up's change says it. */
export type FitLabel = MakeFit | 'designed' | 'none'

const fitLabel = (shape: MakeSummary['shape']): FitLabel =>
	shape.how === 'designed' ? 'designed' : (shape.fit ?? 'none')

/**
 * What changed from plan `before` to plan `after`, in the plan card's order:
 * the length (in whole seconds, as the plan shows it) and the sentences
 * kept, then the shape, captions, text on screen, motion and music. Empty
 * when nothing a person would notice changed.
 */
export function planChanges(before: MakeSummary, after: MakeSummary): PlanChange[] {
	const changes: PlanChange[] = []
	// The look first, as the plan card shows it.
	if (before.look.preset !== after.look.preset) {
		changes.push({ kind: 'look', from: before.look.preset, to: after.look.preset })
	}
	const count = (
		kind: 'length' | 'sentences' | 'keyLines' | 'zooms' | 'transitions',
		from: number,
		to: number
	) => {
		if (from !== to) changes.push({ kind, from, to })
	}
	count('length', Math.round(before.editedSeconds), Math.round(after.editedSeconds))
	count('sentences', before.keptSentences, after.keptSentences)
	if (before.shape.target !== after.shape.target) {
		changes.push({ kind: 'shape', from: before.shape.target, to: after.shape.target })
	}
	if (fitLabel(before.shape) !== fitLabel(after.shape)) {
		changes.push({ kind: 'fit', from: fitLabel(before.shape), to: fitLabel(after.shape) })
	}
	if (before.captions !== after.captions) {
		changes.push({ kind: 'captions', from: before.captions, to: after.captions })
	}
	if (before.title !== after.title)
		changes.push({ kind: 'title', from: before.title, to: after.title })
	count('keyLines', before.keyLines, after.keyLines)
	count('zooms', before.zooms, after.zooms)
	count('transitions', before.transitions, after.transitions)
	if (before.music !== after.music)
		changes.push({ kind: 'music', from: before.music, to: after.music })
	return changes
}

/**
 * A plan as the second check reads it: what was asked, what it makes, how
 * long, the sentences in the order they play (numbered as in the
 * transcript, marked when one is cut short), and its words on screen.
 */
export function describePlan(
	reply: MakeReply,
	summary: MakeSummary,
	clips: readonly Clip[],
	sentences: readonly TranscriptSegment[]
): string {
	const played = clips.flatMap((clip) =>
		clip.ranges.flatMap((range) =>
			sentences.flatMap((sentence, index) => {
				if (!overlaps(range, sentence)) return []
				const whole =
					range.startSeconds <= sentence.startSeconds + 0.01 &&
					range.endSeconds >= sentence.endSeconds - 0.01
				return [`[${index + 1}${whole ? '' : ', cut short'}] ${sentence.text}`]
			})
		)
	)
	return [
		`Making: ${summary.making} (style ${reply.style}), ${summary.editedSeconds.toFixed(1)} s long` +
			(summary.limitSeconds === null
				? '.'
				: `, must be under ${Math.ceil(summary.limitSeconds + 0.01)} s.`),
		'Plays, in order:',
		...(played.length > 0 ? played : ['(no speech)']),
		`Shape: ${summary.shape.target}${summary.shape.fit ? `, ${summary.shape.fit}` : ''}.`,
		`Title: ${summary.title === null ? 'none' : `"${summary.title}"`}`,
		`Key lines: ${reply.keyLines.map((line) => `[${line.sentence}] "${line.text}"`).join(', ') || 'none'}`,
		`Captions: ${summary.captions}. Transitions: ${reply.transition}.`
	].join('\n')
}
