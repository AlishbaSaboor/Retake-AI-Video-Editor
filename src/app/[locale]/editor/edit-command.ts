import { z } from 'zod'
import { regionRect, REGIONS, type NewAnnotation, type Region } from './annotations'
import { clampVolume, DEFAULT_FADE_SECONDS, VOLUME_STEP, type ClipAudio } from './clip-audio'
import { CORNERS, type Corner, type TitleCard } from './overlays'
import { PREVIEW_RATES } from './preview-speed'
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
	'unsupported'
] as const
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

export const editCommandSchema = z.object({
	action: z.enum(ACTIONS),
	startSeconds: z.number().nullable(),
	endSeconds: z.number().nullable(),
	text: z.string().nullable(),
	corner: z.enum(CORNERS).nullable(),
	fromClip: z.number().nullable(),
	toClip: z.number().nullable(),
	rate: z.number().nullable(),
	region: z.enum(REGIONS).nullable(),
	/** How far to turn the picture, clockwise; negative is anticlockwise. */
	degrees: z.number().nullable(),
	axis: z.enum(FLIP_AXES).nullable(),
	aspect: z.enum(COMMAND_ASPECTS).nullable(),
	/** A clip's volume, in percent. */
	percent: z.number().nullable(),
	/** A fade's length. */
	seconds: z.number().nullable()
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
		seconds: NULLABLE_NUMBER
	},
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
		'seconds'
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
			return pair && pair.from < pair.to ? plan({ kind: 'merge', ...pair }) : refuse('no_such_clip')
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
