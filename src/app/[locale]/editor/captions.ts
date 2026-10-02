import { segmentSeconds, type Segment } from './sequence'
import { SENTENCE_END, type TranscriptWord } from './transcript'

// Automatic captions, from the transcript's word timings: no new
// transcription. Built in the edited video's time, like the title card, so
// a cut word never shows and moved clips take their words with them. Over a
// re-recorded sentence the original words are spread evenly across the
// take: the take itself is never transcribed, so they're the words that
// were replaced, not timed to the new speech.

/** One caption: at most two short lines, on screen from start to end of the edited video. */
export type Caption = { lines: string[]; startSeconds: number; endSeconds: number }

/** Short enough to read at a glance; a longer stretch goes on a second line, then a new caption. */
const MAX_LINE_CHARS = 24
const MAX_LINES = 2
/** A pause this long ends a caption, so text doesn't sit on screen through silence. */
const MAX_GAP_SECONDS = 0.7

/** A word's times in the edited video, or null when what's under it doesn't play. */
function editedWord(word: TranscriptWord, segments: Segment[]) {
	const middle = (word.startSeconds + word.endSeconds) / 2
	let before = 0
	for (const segment of segments) {
		const length = segmentSeconds(segment)
		// A re-recorded segment stands for its whole sentence, however long the take.
		const range = segment.voiceOver?.replacement.span ?? segment
		if (middle >= range.startSeconds && middle < range.endSeconds) {
			const scale = length / (range.endSeconds - range.startSeconds)
			const at = (seconds: number) =>
				before +
				(Math.min(Math.max(seconds, range.startSeconds), range.endSeconds) - range.startSeconds) *
					scale
			return {
				text: word.text,
				startSeconds: at(word.startSeconds),
				endSeconds: at(word.endSeconds)
			}
		}
		before += length
	}
	return null
}

/**
 * The captions for the edited video: the transcript's words that still
 * play, in play order, grouped into captions that end at a sentence, a
 * pause, or two full lines.
 */
export function editedCaptions(words: TranscriptWord[], segments: Segment[]): Caption[] {
	const playing = words
		.flatMap((word) => editedWord(word, segments) ?? [])
		.sort((a, b) => a.startSeconds - b.startSeconds)
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
		current ??= { lines: [], startSeconds: word.startSeconds, endSeconds: word.endSeconds }
		line = line ? `${line} ${word.text}` : word.text
		current.endSeconds = word.endSeconds
		endsSentence = SENTENCE_END.test(word.text)
	}
	close()
	return captions
}

/** The caption on screen at `seconds` of the edited video, if any. */
export function captionAt(captions: Caption[], seconds: number): Caption | undefined {
	return captions.find((c) => seconds >= c.startSeconds && seconds < c.endSeconds)
}
