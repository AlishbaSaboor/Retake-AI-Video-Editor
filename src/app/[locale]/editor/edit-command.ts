import { z } from 'zod'
import { regionRect, REGIONS, type NewAnnotation, type Region } from './annotations'
import type { ExtractBlocker } from './audio-lane'
import { findProject, type ProjectSummary } from './projects'
import { clampVolume, DEFAULT_FADE_SECONDS, VOLUME_STEP, type ClipAudio } from './clip-audio'
import {
	clampLevel,
	isNeutral,
	LEVEL_STEP,
	LEVELS,
	LOOKS,
	NEUTRAL_GRADE,
	type ColorGrade,
	type Level,
	type Look
} from './color-grade'
import { clampTextSize, FONTS, toHexColor, type TextStyle } from './text-style'
import { CORNERS, type Corner, type TitleCard } from './overlays'
import { PREVIEW_RATES } from './preview-speed'
import { MAX_CLIP_SPEED, MIN_CLIP_SPEED } from './sequence'
import {
	clampTransitionSeconds,
	DEFAULT_TRANSITION_SECONDS,
	MIN_TRANSITION_SECONDS,
	type TransitionKind
} from './transitions'
import {
	aspectRatio,
	centredCrop,
	normalizeDegrees,
	rotatedFrame,
	withRotation,
	type PictureTransform,
	type Size
} from './transform'
import type { ReRecordBlocker } from './re-record'
import { moveTrimEdge, type TrimRange } from './timeline-scale'
import type { TranscriptSegment } from './transcript'

// What Gemini turns a typed command into. A new command adds an enum value
// here, a branch in commandToPlan, and nothing else. A null edge means "the
// clip's own start/end" ("cut from 3s to the end"). A title's, box's and
// blur's times are in the edited video; a trim's, a split's and a
// sentence's, in the source.
// Clips are numbered from 1, as the Clips strip shows them.
const ACTIONS = [
	'trim',
	'split',
	'merge',
	'move',
	'cleanup',
	'undo',
	'redo',
	'reset',
	'speed',
	'rerecord',
	'export',
	'title',
	'watermark',
	'captions_on',
	'captions_off',
	'box',
	'blur',
	'pixelate',
	'rotate',
	'flip',
	'crop',
	'volume',
	'louder',
	'quieter',
	'mute',
	'unmute',
	'fade_in',
	'fade_out',
	'clip_speed',
	'fade_transition',
	'dissolve',
	'remove_transition',
	'delete_clip',
	'duplicate_clip',
	'color',
	'text_style',
	'add_audio',
	'extract_audio',
	'delete_audio',
	'add_video',
	'save_project',
	'open_project',
	'unsupported'
] as const
/** What a color command changes: a level, a look, or back to normal. */
const COLOR_PROPERTIES = [...LEVELS, ...LOOKS.filter((look) => look !== 'none'), 'normal'] as const
/** What a text-style command styles: the title, the captions, or every annotation text. */
export const TEXT_TARGETS = ['title', 'captions', 'text'] as const
export type TextTarget = (typeof TEXT_TARGETS)[number]
const FLIP_AXES = ['horizontal', 'vertical'] as const
/** "Flip it" with no axis named mirrors left and right. */
const DEFAULT_FLIP_AXIS = 'horizontal'
/** The crop presets a command can name, or 'none' to take the crop off. */
const COMMAND_ASPECTS = ['16:9', '9:16', '1:1', '4:5', 'none'] as const

/** What a transform command changes, for its confirmation. */
export type TransformChange =
	| { kind: 'rotate'; degrees: number; to: number }
	| { kind: 'flip'; axis: (typeof FLIP_AXES)[number] }
	| { kind: 'crop'; aspect: (typeof COMMAND_ASPECTS)[number] }

/** A field left out reads as null, as an unused one is sent: the parse doesn't hang on it. */
const orNull = <T>(value: T | null | undefined): T | null => value ?? null

export const editCommandSchema = z.object({
	action: z.enum(ACTIONS),
	startSeconds: z.number().nullish().transform(orNull),
	endSeconds: z.number().nullish().transform(orNull),
	text: z.string().nullish().transform(orNull),
	corner: z.enum(CORNERS).nullish().transform(orNull),
	fromClip: z.number().nullish().transform(orNull),
	toClip: z.number().nullish().transform(orNull),
	rate: z.number().nullish().transform(orNull),
	region: z.enum(REGIONS).nullish().transform(orNull),
	/** How far to turn the picture, clockwise; negative is anticlockwise. */
	degrees: z.number().nullish().transform(orNull),
	axis: z.enum(FLIP_AXES).nullish().transform(orNull),
	aspect: z.enum(COMMAND_ASPECTS).nullish().transform(orNull),
	/** A clip's volume, in percent. */
	percent: z.number().nullish().transform(orNull),
	/** A fade's length. */
	seconds: z.number().nullish().transform(orNull),
	/** A color command's level or look. */
	property: z.enum(COLOR_PROPERTIES).nullish().transform(orNull),
	/** What a text-style command styles. */
	target: z.enum(TEXT_TARGETS).nullish().transform(orNull),
	/** Text color and band color, #rrggbb; background "none" takes the band off. */
	color: z.string().nullish().transform(orNull),
	background: z.string().nullish().transform(orNull),
	font: z.enum(FONTS).nullish().transform(orNull)
})
export type EditCommand = z.infer<typeof editCommandSchema>

const NULLABLE_NUMBER = { type: ['number', 'null'] }

/** The same shape as JSON Schema, for Gemini's structured output. */
export const EDIT_COMMAND_JSON_SCHEMA = {
	type: 'object',
	properties: {
		action: { type: 'string', enum: ACTIONS },
		startSeconds: NULLABLE_NUMBER,
		endSeconds: NULLABLE_NUMBER,
		text: { type: ['string', 'null'] },
		// The corners are named in the prompt and checked by the schema above.
		corner: { type: ['string', 'null'] },
		fromClip: NULLABLE_NUMBER,
		toClip: NULLABLE_NUMBER,
		rate: NULLABLE_NUMBER,
		// Named in the prompt and checked by the schema above, as corners are.
		region: { type: ['string', 'null'] },
		degrees: NULLABLE_NUMBER,
		// Named in the prompt and checked by the schema above, as corners are.
		axis: { type: ['string', 'null'] },
		aspect: { type: ['string', 'null'] },
		percent: NULLABLE_NUMBER,
		seconds: NULLABLE_NUMBER,
		// Named in the prompt and checked by the schema above, as corners are.
		property: { type: ['string', 'null'] },
		target: { type: ['string', 'null'] },
		color: { type: ['string', 'null'] },
		background: { type: ['string', 'null'] },
		font: { type: ['string', 'null'] }
	},
	// Every field, null when unused. Tried 2026-10-04 with only the action
	// required: half the cost (output ~23 tokens, not ~143), but Gemini then
	// skipped fields it needed ("make clip 2 warmer" lost its clip, "reduce the
	// contrast a lot" its amount). PROGRESS_NOTES.md section 3o.
	required: [
		'action',
		'startSeconds',
		'endSeconds',
		'text',
		'corner',
		'fromClip',
		'toClip',
		'rate',
		'region',
		'degrees',
		'axis',
		'aspect',
		'percent',
		'seconds',
		'property',
		'target',
		'color',
		'background',
		'font'
	]
}

/** Where a watermark goes when the command doesn't say. */
const DEFAULT_CORNER: Corner = 'bottom-right'
/** What a box or blur covers when the command doesn't say: the whole picture. */
const DEFAULT_REGION: Region = 'full'
/** A box from a command is black: the command names no color. */
const COMMAND_BOX_COLOR = '#000000'

/** What a confirmed command does. Clip indexes here count from 0. */
export type CommandPlan =
	| { kind: 'trim'; range: TrimRange }
	| { kind: 'split'; seconds: number }
	| { kind: 'merge'; from: number; to: number }
	| { kind: 'move'; from: number; to: number }
	| { kind: 'cleanup'; seconds: number }
	| { kind: 'undo' }
	| { kind: 'redo' }
	| { kind: 'reset' }
	| { kind: 'speed'; rate: number }
	| { kind: 'rerecord'; sentence: TranscriptSegment }
	| { kind: 'export' }
	| { kind: 'title'; title: TitleCard }
	| { kind: 'watermark'; corner: Corner }
	| { kind: 'captions'; on: boolean }
	| { kind: 'annotation'; region: Region; annotation: NewAnnotation }
	| { kind: 'transform'; transform: PictureTransform; change: TransformChange }
	| { kind: 'clipAudio'; audio: ClipAudio[]; change: AudioChange }
	/** `clip` counts from 1, null for every clip; `skipsTakes`: some clips keep 1× for their take. */
	| { kind: 'clipSpeed'; clip: number | null; speed: number; skipsTakes: boolean }
	/**
	 * `joins`: the clips (by index, from 0) each transition leads into; one
	 * pair named as `pair` (from 1), or null for every join. `transition`
	 * null takes them off. `shortened`: some join allows less than `seconds`.
	 */
	| {
			kind: 'transition'
			transition: TransitionKind | null
			seconds: number
			joins: number[]
			pair: { from: number; to: number } | null
			shortened: boolean
	  }
	/** The adjustments for the whole video (clip null) or one clip (from 1), after the change. */
	| { kind: 'color'; clip: number | null; grade: ColorGrade; change: ColorChange }
	/** The style changes for the title, the captions or every annotation text. */
	| { kind: 'textStyle'; target: TextTarget; changes: Partial<TextStyle> }
	/** An audio file into the lane at `seconds` of the edited video: the picker opens on Apply. */
	| { kind: 'addAudio'; seconds: number }
	/** Clip `clip`'s sound (from 1) out into the Audio lane. */
	| { kind: 'extractAudio'; clip: number }
	/** The lane's audio item `item` (from 1) deleted. */
	| { kind: 'deleteAudio'; item: number }
	/** Another video into the project, after the clips: the file picker opens on Apply. */
	| { kind: 'addVideo' }
	/** The project saved under `name`. */
	| { kind: 'saveProject'; name: string }
	/** A saved project opened in place of this edit; `unsaved`: this edit has changes never saved. */
	| { kind: 'openProject'; id: string; name: string; unsaved: boolean }
	/** `clip` counts from 1. */
	| { kind: 'deleteClip'; clip: number }
	| { kind: 'duplicateClip'; clip: number }

/** Why a command can't be done; each has its own plain answer. */
export type RefusalReason =
	| 'unsupported'
	| 'out_of_range'
	| 'no_such_clip'
	| 'already_there'
	| 'cannot_split'
	| 'nothing_to_clean'
	| 'nothing_to_undo'
	| 'nothing_to_redo'
	| 'nothing_to_reset'
	| 'unsupported_speed'
	| 'unsupported_clip_speed'
	| 'speed_with_take'
	| 'not_adjacent'
	| 'no_join'
	| 'transition_blocked'
	| 'only_clip'
	| 'colors_already_normal'
	| 'no_title'
	| 'no_text'
	| 'audio_after_end'
	| 'merge_videos'
	| 'no_projects'
	| 'no_such_project'
	| 'no_audio'
	| 'no_such_audio'
	| `extract_${ExtractBlocker}`
	| 'no_sentence'
	| 'nothing_to_export'
	| 'nothing_to_uncrop'
type Refusal =
	| { ok: false; reason: RefusalReason }
	| { ok: false; reason: 'cannot_rerecord'; blocker: ReRecordBlocker }
export type CommandOutcome = { ok: true; plan: CommandPlan } | Refusal

/** What a command is checked against: the editor as it is now. */
export type CommandContext = {
	/** The source's length, for a trim. */
	durationSeconds: number
	/** The edited video's length, for a title. */
	editedSeconds: number
	clipCount: number
	canSplitAt: (seconds: number) => boolean
	/** How much clean-up would remove now. */
	cleanupSeconds: number
	canUndo: boolean
	canRedo: boolean
	canReset: boolean
	/** Each clip's volume, mute and fades now, in clip order. */
	clipAudio: ClipAudio[]
	/** Per clip, whether a re-recorded take plays in it: its speed stays 1×. */
	clipTakes: boolean[]
	/** Per clip, how long a transition into it from the clip before can be (0: none). */
	joinLimits: number[]
	/** The whole video's color adjustments and each clip's own. */
	colors: { video: ColorGrade; clips: (ColorGrade | undefined)[] }
	hasTitle: boolean
	/** How many annotation texts there are. */
	textCount: number
	/** How many items the Audio lane has. */
	audioCount: number
	/** Per clip, why its sound can't be taken out into the lane; null where it can. */
	extractBlockers: (ExtractBlocker | null)[]
	/** Where the playhead is in the edited video, for "add music here". */
	playheadSeconds: number
	/** Whether clips `from` to `to` (indexes) can be one: they must be of one video. */
	canMerge: (from: number, to: number) => boolean
	/** The project's name once saved, else what a first save is called. */
	projectName: string
	/** Whether this edit has changes that were never saved. */
	unsaved: boolean
	projects: ProjectSummary[]
	/** The picture's flip, rotation and crop now, and the source picture's size. */
	transform: PictureTransform
	picture: Size
	/** The transcript's sentence at a source time, and why it can't be re-recorded, if so. */
	sentenceAt: (
		seconds: number
	) => { sentence: TranscriptSegment; blocker: ReRecordBlocker | null } | null
}

const refuse = (reason: RefusalReason): Refusal => ({ ok: false, reason })
const plan = (planned: CommandPlan): CommandOutcome => ({ ok: true, plan: planned })

/** Merge or move: clip numbers (from 1) checked against the clips there are, as indexes. */
function clipPair(command: EditCommand, context: CommandContext) {
	const from = (command.fromClip ?? 1) - 1
	const to = (command.toClip ?? context.clipCount) - 1
	const exists = (index: number) =>
		Number.isInteger(index) && index >= 0 && index < context.clipCount
	return exists(from) && exists(to) ? { from, to } : null
}

/** Turns a parsed command into the plan to confirm, or the reason it can't be done. */
export function commandToPlan(command: EditCommand, context: CommandContext): CommandOutcome {
	switch (command.action) {
		case 'trim': {
			const trimmed = commandToTrim(command, context.durationSeconds)
			return trimmed.ok ? plan({ kind: 'trim', range: trimmed.range }) : trimmed
		}
		case 'split': {
			const seconds = command.startSeconds
			if (seconds === null) return refuse('unsupported')
			return context.canSplitAt(seconds) ? plan({ kind: 'split', seconds }) : refuse('cannot_split')
		}
		case 'merge': {
			const pair = clipPair(command, context)
			if (!pair || pair.from >= pair.to) return refuse('no_such_clip')
			return context.canMerge(pair.from, pair.to)
				? plan({ kind: 'merge', ...pair })
				: refuse('merge_videos')
		}
		case 'move': {
			if (command.fromClip === null) return refuse('unsupported')
			const pair = clipPair(command, context)
			if (!pair) return refuse('no_such_clip')
			return pair.from === pair.to ? refuse('already_there') : plan({ kind: 'move', ...pair })
		}
		case 'cleanup':
			return context.cleanupSeconds > 0
				? plan({ kind: 'cleanup', seconds: context.cleanupSeconds })
				: refuse('nothing_to_clean')
		case 'undo':
			return context.canUndo ? plan({ kind: 'undo' }) : refuse('nothing_to_undo')
		case 'redo':
			return context.canRedo ? plan({ kind: 'redo' }) : refuse('nothing_to_redo')
		case 'reset':
			return context.canReset ? plan({ kind: 'reset' }) : refuse('nothing_to_reset')
		case 'speed': {
			const rate = PREVIEW_RATES.find((r) => r === command.rate)
			return rate === undefined ? refuse('unsupported_speed') : plan({ kind: 'speed', rate })
		}
		case 'rerecord': {
			const found = command.startSeconds === null ? null : context.sentenceAt(command.startSeconds)
			if (!found) return refuse('no_sentence')
			// No clean pause isn't a refusal: the panel offers setting the join by ear.
			const { blocker } = found
			return blocker && blocker !== 'no_gap_before' && blocker !== 'no_gap_after'
				? { ok: false, reason: 'cannot_rerecord', blocker }
				: plan({ kind: 'rerecord', sentence: found.sentence })
		}
		case 'export':
			return context.editedSeconds > 0 ? plan({ kind: 'export' }) : refuse('nothing_to_export')
		case 'captions_on':
		case 'captions_off':
			return plan({ kind: 'captions', on: command.action === 'captions_on' })
		case 'watermark':
			return plan({ kind: 'watermark', corner: command.corner ?? DEFAULT_CORNER })
		case 'title': {
			if (!command.text?.trim()) return refuse('unsupported')
			const start = command.startSeconds ?? 0
			const end = Math.min(command.endSeconds ?? context.editedSeconds, context.editedSeconds)
			if (start < 0 || start >= end) return refuse('out_of_range')
			return plan({
				kind: 'title',
				title: { text: command.text.trim(), startSeconds: start, durationSeconds: end - start }
			})
		}
		case 'volume':
		case 'louder':
		case 'quieter':
		case 'mute':
		case 'unmute':
		case 'fade_in':
		case 'fade_out':
			return audioCommand(command, context)
		case 'clip_speed':
			return clipSpeedCommand(command, context)
		case 'fade_transition':
		case 'dissolve':
		case 'remove_transition':
			return transitionCommand(command, context)
		case 'color':
			return colorCommand(command, context)
		case 'text_style':
			return textStyleCommand(command, context)
		case 'add_video':
			return plan({ kind: 'addVideo' })
		case 'save_project':
			return plan({ kind: 'saveProject', name: command.text?.trim() || context.projectName })
		case 'open_project': {
			if (context.projects.length === 0) return refuse('no_projects')
			const found = findProject(context.projects, command.text ?? '')
			return found
				? plan({ kind: 'openProject', id: found.id, name: found.name, unsaved: context.unsaved })
				: refuse('no_such_project')
		}
		case 'add_audio': {
			const seconds = command.startSeconds ?? context.playheadSeconds
			if (seconds < 0 || seconds >= context.editedSeconds) return refuse('audio_after_end')
			return plan({ kind: 'addAudio', seconds })
		}
		case 'extract_audio': {
			const clip = command.fromClip
			if (clip === null) return refuse('unsupported')
			if (!Number.isInteger(clip) || clip < 1 || clip > context.clipCount) {
				return refuse('no_such_clip')
			}
			const blocker = context.extractBlockers[clip - 1]
			return blocker ? refuse(`extract_${blocker}`) : plan({ kind: 'extractAudio', clip })
		}
		case 'delete_audio': {
			if (context.audioCount === 0) return refuse('no_audio')
			const item = command.fromClip ?? context.audioCount
			return Number.isInteger(item) && item >= 1 && item <= context.audioCount
				? plan({ kind: 'deleteAudio', item })
				: refuse('no_such_audio')
		}
		case 'delete_clip':
		case 'duplicate_clip': {
			const clip = command.fromClip
			if (clip === null) return refuse('unsupported')
			if (!Number.isInteger(clip) || clip < 1 || clip > context.clipCount) {
				return refuse('no_such_clip')
			}
			if (command.action === 'duplicate_clip') return plan({ kind: 'duplicateClip', clip })
			return context.clipCount > 1 ? plan({ kind: 'deleteClip', clip }) : refuse('only_clip')
		}
		case 'rotate': {
			if (command.degrees === null || normalizeDegrees(command.degrees) === 0) {
				return refuse('unsupported')
			}
			const transform = withRotation(
				context.transform,
				context.transform.rotation + command.degrees,
				context.picture
			)
			return plan({
				kind: 'transform',
				transform,
				change: { kind: 'rotate', degrees: command.degrees, to: transform.rotation }
			})
		}
		case 'flip': {
			const axis = command.axis ?? DEFAULT_FLIP_AXIS
			const flip = axis === 'horizontal' ? 'flipH' : 'flipV'
			return plan({
				kind: 'transform',
				transform: { ...context.transform, [flip]: !context.transform[flip] },
				change: { kind: 'flip', axis }
			})
		}
		case 'crop': {
			const aspect = command.aspect ?? 'none'
			if (aspect === 'none') {
				return context.transform.crop
					? plan({
							kind: 'transform',
							transform: { ...context.transform, crop: null },
							change: { kind: 'crop', aspect }
						})
					: refuse('nothing_to_uncrop')
			}
			const frame = rotatedFrame(context.picture, context.transform.rotation)
			return plan({
				kind: 'transform',
				transform: {
					...context.transform,
					crop: { rect: centredCrop(aspectRatio(aspect) ?? 1, frame), aspect }
				},
				change: { kind: 'crop', aspect }
			})
		}
		case 'box':
		case 'blur':
		case 'pixelate': {
			const start = command.startSeconds ?? 0
			const end = Math.min(command.endSeconds ?? context.editedSeconds, context.editedSeconds)
			if (start < 0 || start >= end) return refuse('out_of_range')
			const region = command.region ?? DEFAULT_REGION
			const shape = { rect: regionRect(region), startSeconds: start, endSeconds: end }
			return plan({
				kind: 'annotation',
				region,
				annotation:
					command.action === 'box'
						? { kind: 'box', color: COMMAND_BOX_COLOR, ...shape }
						: { kind: command.action, ...shape }
			})
		}
		case 'unsupported':
			return refuse('unsupported')
	}
}

/** What an audio command changes, for its confirmation. Clip numbers count from 1; null is every clip. */
export type AudioChange =
	| { kind: 'volume'; clip: number | null; percent: number }
	| { kind: 'louder' | 'quieter'; clip: number | null }
	| { kind: 'mute' | 'unmute'; clip: number | null }
	| { kind: 'fade_in' | 'fade_out'; clip: number; seconds: number }

const PERCENT = 100

/**
 * Volume, mute and fades. A named clip is that clip; none is every clip,
 * except a fade, which with none named goes on the first clip (in) or the
 * last (out): the start and end of the video.
 */
function audioCommand(command: EditCommand, context: CommandContext): CommandOutcome {
	const count = context.clipAudio.length
	const named = command.fromClip
	if (named !== null && (!Number.isInteger(named) || named < 1 || named > count)) {
		return refuse('no_such_clip')
	}
	const every = (change: (audio: ClipAudio) => ClipAudio) =>
		context.clipAudio.map((audio, index) =>
			named === null || index === named - 1 ? change(audio) : audio
		)
	switch (command.action) {
		case 'volume': {
			if (command.percent === null) return refuse('unsupported')
			const volume = clampVolume(command.percent / PERCENT)
			return plan({
				kind: 'clipAudio',
				audio: every((audio) => ({ ...audio, volume })),
				change: { kind: 'volume', clip: named, percent: Math.round(volume * PERCENT) }
			})
		}
		case 'louder':
		case 'quieter': {
			const factor = command.action === 'louder' ? VOLUME_STEP : 1 / VOLUME_STEP
			return plan({
				kind: 'clipAudio',
				audio: every((audio) => ({ ...audio, volume: clampVolume(audio.volume * factor) })),
				change: { kind: command.action, clip: named }
			})
		}
		case 'mute':
		case 'unmute': {
			const muted = command.action === 'mute'
			return plan({
				kind: 'clipAudio',
				audio: every((audio) => ({ ...audio, muted })),
				change: { kind: command.action, clip: named }
			})
		}
		default: {
			const fadeIn = command.action === 'fade_in'
			const clip = named ?? (fadeIn ? 1 : count)
			const seconds = command.seconds ?? DEFAULT_FADE_SECONDS
			if (seconds <= 0) return refuse('unsupported')
			const field = fadeIn ? 'fadeInSeconds' : 'fadeOutSeconds'
			return plan({
				kind: 'clipAudio',
				audio: context.clipAudio.map((audio, index) =>
					index === clip - 1 ? { ...audio, [field]: seconds } : audio
				),
				change: { kind: fadeIn ? 'fade_in' : 'fade_out', clip, seconds }
			})
		}
	}
}

/**
 * A clip's real speed, 0.25× to 4×: a named clip, or every clip. Out of
 * range is refused, not clamped: "8x" isn't quietly 4×. A clip with a
 * re-recorded take keeps 1×.
 */
function clipSpeedCommand(command: EditCommand, context: CommandContext): CommandOutcome {
	const speed = command.rate
	if (speed === null || speed < MIN_CLIP_SPEED || speed > MAX_CLIP_SPEED) {
		return refuse('unsupported_clip_speed')
	}
	const named = command.fromClip
	if (named === null) {
		if (context.clipTakes.every(Boolean)) return refuse('speed_with_take')
		return plan({
			kind: 'clipSpeed',
			clip: null,
			speed,
			skipsTakes: context.clipTakes.some(Boolean)
		})
	}
	if (!Number.isInteger(named) || named < 1 || named > context.clipCount) {
		return refuse('no_such_clip')
	}
	return context.clipTakes[named - 1]
		? refuse('speed_with_take')
		: plan({ kind: 'clipSpeed', clip: named, speed, skipsTakes: false })
}

/** What a color command changed, for its confirmation. `percent` is the level after it. */
export type ColorChange =
	| { kind: 'level'; level: Level; percent: number }
	| { kind: 'look'; look: Look }
	| { kind: 'normal' }

const isLevel = (property: string): property is Level => LEVELS.some((level) => level === property)
const isLook = (property: string): property is Look => LOOKS.some((look) => look === property)

/**
 * Brightness, contrast or saturation up or down by `percent` points (20 if
 * none), a look, or back to normal, for one clip or the whole video.
 */
function colorCommand(command: EditCommand, context: CommandContext): CommandOutcome {
	const { property } = command
	if (property === null) return refuse('unsupported')
	const clip = command.fromClip
	if (clip !== null && (!Number.isInteger(clip) || clip < 1 || clip > context.clipCount)) {
		return refuse('no_such_clip')
	}
	const current =
		clip === null ? context.colors.video : (context.colors.clips[clip - 1] ?? NEUTRAL_GRADE)
	const planned = (grade: ColorGrade, change: ColorChange) =>
		plan({ kind: 'color', clip, grade, change })
	if (property === 'normal') {
		return isNeutral(current)
			? refuse('colors_already_normal')
			: planned(NEUTRAL_GRADE, { kind: 'normal' })
	}
	if (isLevel(property)) {
		const step = command.percent === null ? LEVEL_STEP : command.percent / PERCENT
		const level = clampLevel(current[property] + step)
		return planned(
			{ ...current, [property]: level },
			{ kind: 'level', level: property, percent: Math.round(level * PERCENT) }
		)
	}
	return isLook(property)
		? planned({ ...current, look: property }, { kind: 'look', look: property })
		: refuse('unsupported')
}

/**
 * The title's, the captions' or every annotation text's color, background
 * (or none), font or size (percent of normal). Only what the command names
 * changes; a color that's neither #rrggbb nor a name it knows is left out.
 */
function textStyleCommand(command: EditCommand, context: CommandContext): CommandOutcome {
	const { target } = command
	if (target === null) return refuse('unsupported')
	if (target === 'title' && !context.hasTitle) return refuse('no_title')
	if (target === 'text' && context.textCount === 0) return refuse('no_text')
	const changes: Partial<TextStyle> = {}
	const color = command.color && toHexColor(command.color)
	if (color) changes.color = color
	const background = command.background && toHexColor(command.background)
	if (command.background === 'none') changes.background = null
	else if (background) changes.background = background
	if (command.font) changes.font = command.font
	if (command.percent !== null && command.percent > 0) {
		changes.size = clampTextSize(command.percent / PERCENT)
	}
	return Object.keys(changes).length === 0
		? refuse('unsupported')
		: plan({ kind: 'textStyle', target, changes })
}

/**
 * A transition between two clips side by side (fromClip and toClip, or
 * just fromClip: the join after it), or every join when none is named. A
 * join with no room for one (a re-recorded sentence or very short clips
 * there) is refused when named, skipped when it's every join.
 */
function transitionCommand(command: EditCommand, context: CommandContext): CommandOutcome {
	if (context.clipCount < 2) return refuse('no_join')
	const transition: TransitionKind | null =
		command.action === 'fade_transition'
			? 'fade'
			: command.action === 'dissolve'
				? 'dissolve'
				: null
	const exists = (clip: number) => Number.isInteger(clip) && clip >= 1 && clip <= context.clipCount
	let pair: { from: number; to: number } | null = null
	if (command.fromClip !== null) {
		const from = command.fromClip
		const to = command.toClip ?? from + 1
		if (!exists(from) || !exists(to)) return refuse('no_such_clip')
		if (Math.abs(to - from) !== 1) return refuse('not_adjacent')
		pair = { from: Math.min(from, to), to: Math.max(from, to) }
	}
	const named = pair ? [pair.to - 1] : context.joinLimits.slice(1).map((_, i) => i + 1)
	const seconds = clampTransitionSeconds(command.seconds ?? DEFAULT_TRANSITION_SECONDS)
	const limit = (index: number) => context.joinLimits[index] ?? 0
	const joins =
		transition === null ? named : named.filter((index) => limit(index) >= MIN_TRANSITION_SECONDS)
	if (joins.length === 0) return refuse('transition_blocked')
	return plan({
		kind: 'transition',
		transition,
		seconds,
		joins,
		pair,
		shortened: transition !== null && joins.some((index) => limit(index) < seconds)
	})
}

/**
 * Turns a parsed command into a trim of the whole source, through the same
 * moveTrimEdge the handles use — so "cut from 2 to 5" means exactly 2–5
 * whatever the clip was trimmed to before, and stays undoable by dragging.
 */
export function commandToTrim(
	command: EditCommand,
	durationSeconds: number
): { ok: true; range: TrimRange } | Refusal {
	if (command.action !== 'trim') return refuse('unsupported')
	const start = command.startSeconds ?? 0
	const end = command.endSeconds ?? durationSeconds
	if (start < 0 || start >= end || start >= durationSeconds) {
		return refuse('out_of_range')
	}
	const whole: TrimRange = { startSeconds: 0, endSeconds: durationSeconds }
	const range = moveTrimEdge(
		moveTrimEdge(whole, 'start', start, durationSeconds),
		'end',
		end,
		durationSeconds
	)
	return { ok: true, range }
}
