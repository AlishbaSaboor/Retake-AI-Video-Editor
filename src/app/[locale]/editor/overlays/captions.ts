import { editedStarts, segmentSeconds, type Segment } from '../model/sequence'
import { SENTENCE_END, type TranscriptWord } from '../audio/transcript'

// Automatic captions, from the transcript's word timings: no new
// transcription. Built in the edited video's time, like the title card, so
// a cut word never shows and moved clips take their words with them. Over a
// re-recorded sentence the original words are spread evenly across the
// take: the take itself is never transcribed, so they're the words that
// were replaced, not timed to the new speech.

/**
 * One caption: at most two short lines, on screen from start to end of the
 * edited video. `spoken`: when each of its words (across its lines, in
 * order) is said, for highlighting the word being spoken.
 */
export type Caption = {
	lines: string[]
	startSeconds: number
	endSeconds: number
	spoken?: number[]
}

/** How captions show: a line or two at a time, one word at a time, or lines with the word being spoken picked out. */
export const CAPTION_MODES = ['lines', 'words', 'highlight'] as const
export type CaptionMode = (typeof CAPTION_MODES)[number]

/** The word being spoken, picked out in highlighted captions: yellow, or white when the text already is. */
const HIGHLIGHT_COLOR = '#ffd400'
export function highlightColor(textColor: string, chosen?: string): string {
	if (chosen) return chosen
	return textColor.toLowerCase() === HIGHLIGHT_COLOR ? '#ffffff' : HIGHLIGHT_COLOR
}

/** Short enough to read at a glance; a longer stretch goes on a second line, then a new caption. */
const MAX_LINE_CHARS = 24
const MAX_LINES = 2
/** A pause this long ends a caption, so text doesn't sit on screen through silence. */
const MAX_GAP_SECONDS = 0.7

/**
 * A word's times in the edited video: none when what's under it doesn't
 * play, more than one when a duplicated clip plays it twice.
 */
function editedWord(word: TranscriptWord, segments: Segment[], starts: number[]) {
	const middle = (word.startSeconds + word.endSeconds) / 2
	return segments.flatMap((segment, index) => {
		// The transcript is the main video's: an added video's clips have no words.
		if (segment.source) return []
		const before = starts[index] ?? 0
		const length = segmentSeconds(segment)
		// A re-recorded segment stands for its whole sentence, however long the take.
		const range = segment.voiceOver?.replacement.span ?? segment
		if (middle < range.startSeconds || middle >= range.endSeconds) return []
		const scale = length / (range.endSeconds - range.startSeconds)
		const at = (seconds: number) =>
			before +
			(Math.min(Math.max(seconds, range.startSeconds), range.endSeconds) - range.startSeconds) *
				scale
		return [
			{ text: word.text, startSeconds: at(word.startSeconds), endSeconds: at(word.endSeconds) }
		]
	})
}

/** The transcript's words that still play, in the edited video's time and play order. */
export function editedWords(words: TranscriptWord[], segments: Segment[]): TranscriptWord[] {
	const starts = editedStarts(segments)
	return words
		.flatMap((word) => editedWord(word, segments, starts))
		.sort((a, b) => a.startSeconds - b.startSeconds)
}

/**
 * The captions for the edited video: the transcript's words that still
 * play, in play order, grouped into captions that end at a sentence, a
 * pause, or two full lines. `words`: one word at a time instead, each
 * held until the next starts unless a pause comes first. `highlight`: the
 * lines, with when each word is said; `timed` gives the lines that too (a
 * designed frame's captions pop each word as it's said).
 */
export function editedCaptions(
	words: TranscriptWord[],
	segments: Segment[],
	mode: CaptionMode = 'lines',
	timed = mode === 'highlight'
): Caption[] {
	const playing = editedWords(words, segments)
	if (mode === 'words') {
		return playing.map((word, index) => {
			const next = playing[index + 1]
			const held = next && next.startSeconds - word.endSeconds <= MAX_GAP_SECONDS
			return {
				lines: [word.text],
				startSeconds: word.startSeconds,
				endSeconds: held ? next.startSeconds : word.endSeconds
			}
		})
	}
	const captions: Caption[] = []
	let current: Caption | null = null
	let line = ''
	let endsSentence = false
	const close = () => {
		if (current && line) captions.push({ ...current, lines: [...current.lines, line] })
		current = null
		line = ''
	}
	for (const word of playing) {
		if (current && (endsSentence || word.startSeconds - current.endSeconds > MAX_GAP_SECONDS)) {
			close()
		}
		if (current && line && `${line} ${word.text}`.length > MAX_LINE_CHARS) {
			if (current.lines.length + 1 >= MAX_LINES) close()
			else {
				current.lines.push(line)
				line = ''
			}
		}
		current ??= {
			lines: [],
			startSeconds: word.startSeconds,
			endSeconds: word.endSeconds,
			...(timed && { spoken: [] })
		}
		current.spoken?.push(word.startSeconds)
		line = line ? `${line} ${word.text}` : word.text
		current.endSeconds = word.endSeconds
		endsSentence = SENTENCE_END.test(word.text)
	}
	close()
	return captions
}

/** Which of a caption's words (counted across its lines) is being said at `seconds`; null when none is picked out. */
export function spokenWordAt(caption: Caption, seconds: number): number | null {
	if (!caption.spoken) return null
	const index = caption.spoken.findLastIndex((start) => start <= seconds)
	return index === -1 ? null : index
}

/** The caption on screen at `seconds` of the edited video, if any. */
export function captionAt(captions: Caption[], seconds: number): Caption | undefined {
	return captions.find((c) => seconds >= c.startSeconds && seconds < c.endSeconds)
}
