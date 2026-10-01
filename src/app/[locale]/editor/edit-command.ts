import { z } from 'zod'
import { moveTrimEdge, type TrimRange } from './timeline-scale'

// What Gemini turns a typed command into. One action today; a new command
// adds an enum value here, a branch in commandToTrim, and nothing else.
// A null edge means "the clip's own start/end" ("cut from 3s to the end").
export const editCommandSchema = z.object({
	action: z.enum(['trim', 'unsupported']),
	startSeconds: z.number().nullable(),
	endSeconds: z.number().nullable()
})
export type EditCommand = z.infer<typeof editCommandSchema>

/** The same shape as JSON Schema, for Gemini's structured output. */
export const EDIT_COMMAND_JSON_SCHEMA = {
	type: 'object',
	properties: {
		action: { type: 'string', enum: ['trim', 'unsupported'] },
		startSeconds: { type: ['number', 'null'] },
		endSeconds: { type: ['number', 'null'] }
	},
	required: ['action', 'startSeconds', 'endSeconds']
}

export type CommandOutcome =
	{ ok: true; range: TrimRange } | { ok: false; reason: 'unsupported' | 'out_of_range' }

/**
 * Turns a parsed command into a trim of the whole source, through the same
 * moveTrimEdge the handles use — so "cut from 2 to 5" means exactly 2–5
 * whatever the clip was trimmed to before, and stays undoable by dragging.
 */
export function commandToTrim(command: EditCommand, durationSeconds: number): CommandOutcome {
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
