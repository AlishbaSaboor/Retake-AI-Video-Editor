import type { Transcript, TranscriptSegment, TranscriptWord } from '../../editor/audio/transcript'
import type { AudioItem } from '../../editor/model/audio-lane'
import type { Cut } from '../../editor/model/cleanup'
import type { EditSnapshot } from '../../editor/model/edit-snapshot'
import type { Size } from '../../editor/model/transform'
import type { Design } from '../../editor/overlays/design'
import { choiceWords, type MakeChoices, type MakeKind } from './make-questions'
import { choosePreset, type Preset, presetLook, type PresetLook } from './make-presets'
import {
	type CaptionLook,
	frameTimes,
	type MakeFit,
	type MakeFormat,
	type MakeReply,
	type MakeShape,
	type MakeStyle,
	type ScreenTreatment
} from './make-reply'
import { CAPTIONS_REQUEST, PROMO_REQUEST } from './make-request'

// The shapes a Make it plan is built from and into, and the context planMake reads its input through.

/** Music the folder offers, decoded, to lay under the edit. */
export type MusicTrack<Sound> = { name: string; file: Blob; buffer: Sound; seconds: number }

/** The parts of a brief the plan card names. */
export type BriefPart = 'audience' | 'tone' | 'show' | 'lengthSeconds' | 'callToAction'

/** What the plan does, in words for the person deciding whether to apply it. */
export type MakeSummary = {
	style: MakeStyle
	/** What it is making, as the plan's first words say: a format named, else the style. */
	making: Exclude<MakeFormat, 'other'> | MakeStyle
	summary: string
	/** The most it may run (short-form, or asked), and whether sentences beyond the reply's were taken out to fit. */
	limitSeconds: number | null
	/** The most it may run as a follow-up asked ("make it 30 seconds", "shorter"); null when none was asked. */
	maxSeconds: number | null
	trimmedToFit: boolean
	/** The check found it too short, and sentences the plan had left out were put back. */
	lengthened: boolean
	/**
	 * Still short: a reel, TikTok or Short under 50 s of a video that runs
	 * longer (`short_form`), or shorter than the check says the request
	 * wants with nothing to add (`asked`); null when it isn't.
	 */
	short: 'short_form' | 'asked' | null
	/** Sentences kept of all the transcript's. */
	keptSentences: number
	totalSentences: number
	originalSeconds: number
	editedSeconds: number
	/** Parts taken out (dead air, dropped sentences, dead stretches) and filler words cut. */
	removedParts: number
	fillerCuts: number
	captions: CaptionLook
	/** Key lines shown, quoted from the transcript; and whether it opens with its strongest moment. */
	keyLines: number
	opensWith: string | null
	zooms: number
	transition: MakeReply['transition']
	transitions: number
	/** The track laid under it; null with none, `missing` when the folder has none to offer. */
	music: string | null
	musicMissing: boolean
	/**
	 * The shape it comes out, and how the video goes into it: `how` is why
	 * (`kept`: its own shape; `matches`: already the shape; `designed`: a
	 * frame designed around the speech; `face`: zoomed to follow one person;
	 * `centred`: zoomed in, centred; `whole`: all of it, with bars or a
	 * blur). `fit` is null when nothing had to fit. `asked`: the request
	 * named the fit.
	 */
	shape: {
		target: MakeShape
		fit: MakeFit | null
		how: 'kept' | 'matches' | 'designed' | 'face' | 'centred' | 'whole'
		asked: boolean
	}
	/**
	 * A screen recording's treatment and why: the default (whole), a request
	 * for an ad, promo, teaser or highlights (designed), asked for in so many
	 * words, or whole because the second check couldn't run. Null for any
	 * other video.
	 */
	screen: {
		treatment: ScreenTreatment
		why: 'default' | 'promo' | 'asked' | 'unchecked'
	} | null
	/**
	 * The parts of a brief the plan used: who it's for and its tone (in the
	 * style, captions and music), what to show (in what it keeps), a length
	 * (the most it runs), and the call to action shown at the end.
	 */
	brief: {
		audience: string | null
		tone: string | null
		show: string | null
		lengthSeconds: number | null
		callToAction: string | null
		/** Which of them the user's own words gave; the plan chose the rest. */
		said: Record<BriefPart, boolean>
		/** What the plan chose the rest for: a promo, when the request reads as one, else the user. */
		chosenFor: 'promo' | 'you'
	}
	/** A designed frame's picture: a small card in a corner, or hidden; null when not designed. */
	card: Design['picture'] | null
	title: string | null
	/** A title was asked for but named someone or something never said: left out. */
	titleDropped: boolean
	pictureMatters: boolean
	cannotDo: string[]
	/** The look (make-presets.ts), and whether the user's words or a click chose it. */
	look: { preset: Preset; said: boolean }
	/**
	 * The quick questions shown before planning (absent when none were):
	 * what it is and an ad's shape, as planned, and whether the user picked
	 * it (`said`) or left it to "You decide", so it was chosen for them.
	 */
	questions?: {
		kind?: { value: MakeKind | MakeSummary['making']; said: boolean }
		shape?: { value: MakeShape; said: boolean }
	}
}

/** The edit a plan makes, as the editor applies it. */
export type PlannedEdit<Sound> = Omit<EditSnapshot, 'audioItems'> & {
	audioItems: AudioItem<Sound>[]
}

/** A plan as applied: the reply it came from, what it said, and its edit. */
export type MadePlan<Sound> = {
	reply: MakeReply
	summary: MakeSummary
	edit: PlannedEdit<Sound>
	music: MusicTrack<Sound> | null
}

/**
 * Whether the editor's edit is still `plan`'s, as applied: the same values,
 * not copies (applying a plan puts its own in place; Undo puts them back).
 */
export function isPlanEdit<Sound>(
	plan: PlannedEdit<Sound>,
	edit: Pick<
		PlannedEdit<Sound>,
		| 'clips'
		| 'cuts'
		| 'title'
		| 'captionsOn'
		| 'captionMode'
		| 'captionStyle'
		| 'transform'
		| 'audioItems'
		| 'autoZooms'
		| 'autoTitles'
		| 'design'
	>
): boolean {
	return (
		plan.clips === edit.clips &&
		plan.cuts === edit.cuts &&
		plan.title === edit.title &&
		plan.captionsOn === edit.captionsOn &&
		plan.captionMode === edit.captionMode &&
		plan.captionStyle === edit.captionStyle &&
		plan.transform === edit.transform &&
		plan.audioItems === edit.audioItems &&
		plan.autoZooms === edit.autoZooms &&
		plan.autoTitles === edit.autoTitles &&
		plan.design === edit.design
	)
}

/** What every plan of one video is made from, besides its reply: handed to the editor for follow-ups. */
export type MakeBasis = {
	request: string
	/** The answers to the quick questions, when they were shown. */
	choices?: MakeChoices | null
	durationSeconds: number
	picture: Size
	fillerCuts: Cut[]
	musicAvailable: boolean
	/** The video's own colour (video-colours.ts), null when it has none. */
	videoColour?: string | null
}

export type MakeInput<Sound> = {
	reply: MakeReply
	request: string
	durationSeconds: number
	picture: Size
	transcript: Transcript | null
	/** Filler words with a clean pause either side (filler-cuts.ts): safe to cut. */
	fillerCuts: Cut[]
	/** The track Gemini picked, fetched and decoded; null when none was picked or none could be had. */
	music: MusicTrack<Sound> | null
	/** Whether the music folder offered any track at all. */
	musicAvailable: boolean
	/**
	 * The second check found the edit too short: sentences the plan left out
	 * may come back to fill it, except those the check itself dropped.
	 */
	tooShort?: { keepOut: number[] } | null
	/** The second check couldn't run: a screen recording then shows whole, never designed. */
	unchecked?: boolean
	/**
	 * What the user asked after the request (follow-ups, in order): read with
	 * it for what they asked of the treatment and the fit.
	 */
	followUps?: readonly string[]
	/** The answers to the quick questions, when they were shown: the user's own words too. */
	choices?: MakeChoices | null
	/** The video's own colour (video-colours.ts), for its look; null when it has none. */
	videoColour?: string | null
}

/** What every cut of one plan is made from: the reply, the transcript's sentences, the video. */
export type PlanContext = {
	reply: MakeReply
	sentences: readonly TranscriptSegment[]
	durationSeconds: number
	picture: Size
	/** The times the pictures Gemini saw were taken at. */
	times: readonly number[]
	/** Filler words with a clean pause either side: those in what's kept are cut. */
	fillerCuts: Cut[]
	/** The picture carries the video, or there's no speech to plan by. */
	pictureMatters: boolean
	/** A screen recording (a demo, a walkthrough, a shared screen): never zoomed into. */
	screen: boolean
	/** The transition, the look's: a screen recording gets no zoom cuts. */
	transition: MakeReply['transition']
	hasWords: boolean
	/** Every word said, with its time: where a key word starts, for its zoom. */
	words: readonly TranscriptWord[]
	/** How the plan looks: one preset, on this video's colours. */
	look: PresetLook
	/** The user's words or a click chose the look. */
	lookSaid: boolean
	/** The user's own words mention the captions: the reply's caption look is kept, in the look's colours. */
	captionsAsked: boolean
	/**
	 * The user's own words, the request and each follow-up: only they count
	 * as asking (Gemini fills its fields in whether or not anyone asked).
	 */
	said: readonly string[]
	/** The request reads as an ad, a promo, a teaser or a highlights reel. */
	promo: boolean
	/** Every word said in the video, and the request: all that words on screen may use. */
	known: string
}

/** What a cut is made from. */
export type CutBasis = Pick<
	PlanContext,
	| 'reply'
	| 'sentences'
	| 'durationSeconds'
	| 'fillerCuts'
	| 'pictureMatters'
	| 'transition'
	| 'look'
>

/**
 * Where a webcam bubble sits, on Gemini's 0 to 1000 grid of each picture:
 * a face at or below `low`, or at or above `high`, both across and down, is
 * in a corner; in at least `share` of the pictures with a face, it's a
 * bubble over something else, not a person filling the frame.
 */
export const FACE_CORNER = { low: 300, high: 700, share: 0.5 } as const

/**
 * A screen recording with the speaker in a webcam bubble: Gemini sees the
 * face and says one person, with the picture as a corner card, but the face
 * sits in a corner of the picture. A person filling the frame has theirs
 * nearer the middle. With no face positions, it isn't one.
 */
export function webcamOverScreen(reply: Pick<MakeReply, 'subject' | 'card' | 'faces'>): boolean {
	if (reply.subject !== 'one_person' || reply.card !== 'corner' || reply.faces.length === 0) {
		return false
	}
	const outer = (value: number) => value <= FACE_CORNER.low || value >= FACE_CORNER.high
	const cornered = reply.faces.filter((face) => outer(face.x) && outer(face.y)).length
	return cornered >= reply.faces.length * FACE_CORNER.share
}

/** What every step of one plan reads, worked out once from its input. */
export function planContext(input: MakeInput<unknown>): PlanContext {
	const { reply, durationSeconds, picture, transcript } = input
	const sentences = transcript?.segments ?? []
	const words = transcript?.words ?? []
	// A webcam bubble over a screen is a screen recording, whatever the label.
	const screen = reply.subject === 'screen' || webcamOverScreen(reply)
	// The answers' words count as the user's; a look clicked sets the look alone (it's read from
	// choices.style), never a brief part: "A bold look." is no bold tone.
	const chosen = choiceWords(input.choices && { ...input.choices, style: null })
	const said = [input.request, ...chosen, ...(input.followUps ?? [])]
	const preset = choosePreset(reply.style, input.request, input.choices?.style, input.followUps)
	const look = presetLook(preset.preset, input.videoColour ?? null)
	const transition = look.transition.kind
	return {
		reply,
		sentences,
		durationSeconds,
		picture,
		times: frameTimes(durationSeconds),
		fillerCuts: input.fillerCuts,
		pictureMatters: reply.pictureMatters || sentences.length === 0,
		screen,
		transition: screen && transition === 'zoom_cut' ? 'none' : transition,
		hasWords: words.length > 0,
		words,
		look,
		lookSaid: preset.said,
		captionsAsked: said.some((text) => CAPTIONS_REQUEST.test(text)),
		said,
		promo: said.some((text) => PROMO_REQUEST.test(text)),
		known: [...words.map((word) => word.text), input.request, ...chosen].join(' ')
	}
}

/** The sentences (indexes, first to last) of the moment a short-form edit opens with. */
export type Opener = { from: number; to: number }

/** How long a plan may run, and what it fills towards. */
export type LengthLimits = {
	/** A reel, TikTok or Short: under a minute, vertical, opening with its strongest moment. */
	shortForm: boolean
	/** A length asked for (in the request, or a follow-up); null when none was. */
	asked: number | null
	/** The most it may run; null when nothing limits it. */
	limitSeconds: number | null
	/** What a cut to fit is filled towards. */
	target: number
}

/** The most the plan may run, and whether the user's own words asked it. */
export type AskedLength = { seconds: number | null; said: boolean }
