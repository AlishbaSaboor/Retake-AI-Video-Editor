import { z } from 'zod'
import type { TranscriptSegment } from './transcript'

// Highlights: the best moments of a take, picked by Gemini from its
// transcript. The model only names whole sentences, by number — a first and
// a last one — so a moment always starts on a sentence's first word and
// ends on its last, never part-way through one. The times come from the
// transcript here, not from the model.

export const MIN_HIGHLIGHTS = 3
export const MAX_HIGHLIGHTS = 5
/** How many picks are read from a reply: a few spare, for any dropped as invalid. */
export const MAX_PICKS = 8
export const MAX_TITLE_LENGTH = 60
export const MAX_DESCRIPTION_LENGTH = 160
/** Room left before a moment's first word and after its last, taken only from the pause between sentences. */
export const EDGE_PADDING_SECONDS = 0.15

/** One moment as the model names it: sentences numbered from 1, first to last. */
export type HighlightPick = {
	firstSentence: number
	lastSentence: number
	title: string
	description: string
}

/** One moment of the source, in its own seconds. */
export type Highlight = {
	title: string
	description: string
	startSeconds: number
	endSeconds: number
}

const clipped = (max: number) =>
	z
		.string()
		.transform((text) => text.trim().slice(0, max))
		.pipe(z.string().min(1))

export const highlightPickSchema = z.object({
	firstSentence: z.number().int(),
	lastSentence: z.number().int(),
	title: clipped(MAX_TITLE_LENGTH),
	description: clipped(MAX_DESCRIPTION_LENGTH)
})

export const highlightsReplySchema = z.object({
	highlights: z.array(highlightPickSchema).max(MAX_PICKS)
})

/** The reply's shape, for Gemini's structured output. */
export const HIGHLIGHTS_JSON_SCHEMA = {
	type: 'object',
	properties: {
		highlights: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					firstSentence: { type: 'integer' },
					lastSentence: { type: 'integer' },
					title: { type: 'string' },
					description: { type: 'string' }
				},
				required: ['firstSentence', 'lastSentence', 'title', 'description']
			}
		}
	},
	required: ['highlights']
} as const

/**
 * Turns the model's picks into moments of the source: each pick's first
 * sentence's start to its last one's end, padded a little into the pauses
 * around it. Picks naming a sentence that doesn't exist, or overlapping one
 * kept before them (the model lists the best first), are dropped; at most
 * `MAX_HIGHLIGHTS` are kept, in the order they play.
 */
export function planHighlights(
	sentences: readonly TranscriptSegment[],
	picks: readonly HighlightPick[],
	durationSeconds: number
): Highlight[] {
	const kept: Array<{ first: number; last: number; pick: HighlightPick }> = []
	for (const pick of picks) {
		if (kept.length === MAX_HIGHLIGHTS) break
		const first = Math.min(pick.firstSentence, pick.lastSentence) - 1
		const last = Math.max(pick.firstSentence, pick.lastSentence) - 1
		if (first < 0 || last >= sentences.length) continue
		if (kept.some((other) => first <= other.last && last >= other.first)) continue
		kept.push({ first, last, pick })
	}
	return kept
		.sort((a, b) => a.first - b.first)
		.map(({ first, last, pick }) => {
			const start = sentences[first]?.startSeconds ?? 0
			const end = sentences[last]?.endSeconds ?? durationSeconds
			const before = sentences[first - 1]?.endSeconds ?? 0
			const after = sentences[last + 1]?.startSeconds ?? durationSeconds
			return {
				title: pick.title,
				description: pick.description,
				// Never inside the moment's own words, whatever the neighbours' times.
				startSeconds: Math.max(0, Math.min(start, Math.max(before, start - EDGE_PADDING_SECONDS))),
				endSeconds: Math.min(
					durationSeconds,
					Math.max(end, Math.min(after, end + EDGE_PADDING_SECONDS))
				)
			}
		})
}

/** The transcript as the model reads it: one numbered sentence a line, with its times. */
export function numberedSentences(sentences: readonly TranscriptSegment[]): string {
	return sentences
		.map(
			(sentence, index) =>
				`[${index + 1}] (${sentence.startSeconds.toFixed(1)}-${sentence.endSeconds.toFixed(1)} s) ${sentence.text}`
		)
		.join('\n')
}
