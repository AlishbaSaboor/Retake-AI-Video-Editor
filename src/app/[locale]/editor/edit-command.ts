import { z } from 'zod'
import { CORNERS, type Corner, type TitleCard } from './overlays'
import { moveTrimEdge, type TrimRange } from './timeline-scale'

// What Gemini turns a typed command into. A new command adds an enum value
// here, a branch in commandToPlan, and nothing else. A null edge means "the
// clip's own start/end" ("cut from 3s to the end"). A title's times are in
// the edited video; a trim's, in the source.
const ACTIONS = [
	'trim',
	'title',
	'watermark',
	'captions_on',
	'captions_off',
	'unsupported'
] as const
export const editCommandSchema = z.object({
	action: z.enum(ACTIONS),
	startSeconds: z.number().nullable(),
	endSeconds: z.number().nullable(),
	text: z.string().nullable(),
	corner: z.enum(CORNERS).nullable()
})
export type EditCommand = z.infer<typeof editCommandSchema>

/** The same shape as JSON Schema, for Gemini's structured output. */
export const EDIT_COMMAND_JSON_SCHEMA = {
	type: 'object',
	properties: {
		action: { type: 'string', enum: ACTIONS },
		startSeconds: { type: ['number', 'null'] },
		endSeconds: { type: ['number', 'null'] },
		text: { type: ['string', 'null'] },
		// The corners are named in the prompt and checked by the schema above.
		corner: { type: ['string', 'null'] }
	},
	required: ['action', 'startSeconds', 'endSeconds', 'text', 'corner']
}

/** Where a watermark goes when the command doesn't say. */
const DEFAULT_CORNER: Corner = 'bottom-right'

/** What a confirmed command does. */
export type CommandPlan =
	| { kind: 'trim'; range: TrimRange }
	| { kind: 'title'; title: TitleCard }
	| { kind: 'watermark'; corner: Corner }
	| { kind: 'captions'; on: boolean }

type Refusal = { ok: false; reason: 'unsupported' | 'out_of_range' }
export type CommandOutcome = { ok: true; plan: CommandPlan } | Refusal

/**
 * Turns a parsed command into the plan to confirm. `durationSeconds` is the
 * source's length, for a trim; `editedSeconds` the edited video's, for a title.
 */
export function commandToPlan(
	command: EditCommand,
	durationSeconds: number,
	editedSeconds: number
): CommandOutcome {
	if (command.action === 'trim') {
		const trimmed = commandToTrim(command, durationSeconds)
		return trimmed.ok ? { ok: true, plan: { kind: 'trim', range: trimmed.range } } : trimmed
	}
	if (command.action === 'captions_on' || command.action === 'captions_off') {
		return { ok: true, plan: { kind: 'captions', on: command.action === 'captions_on' } }
	}
	if (command.action === 'watermark') {
		return { ok: true, plan: { kind: 'watermark', corner: command.corner ?? DEFAULT_CORNER } }
	}
	if (command.action === 'title' && command.text?.trim()) {
		const start = command.startSeconds ?? 0
		const end = Math.min(command.endSeconds ?? editedSeconds, editedSeconds)
		if (start < 0 || start >= end) return { ok: false, reason: 'out_of_range' }
		return {
			ok: true,
			plan: {
				kind: 'title',
				title: { text: command.text.trim(), startSeconds: start, durationSeconds: end - start }
			}
		}
	}
	return { ok: false, reason: 'unsupported' }
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
	if (command.action !== 'trim') return { ok: false, reason: 'unsupported' }
	const start = command.startSeconds ?? 0
	const end = command.endSeconds ?? durationSeconds
	if (start < 0 || start >= end || start >= durationSeconds) {
		return { ok: false, reason: 'out_of_range' }
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
