import type { Transcript } from './transcript'

// Filler words, found in the transcript the take already has — no extra AI
// call. Deliberately narrow: a missed "um" costs the user a second of
// scrubbing; flagging normal speech teaches them to ignore the flags.

export type FillerWord = { word: string; atSeconds: number }

// Hesitation sounds that are never real words, any length ("ummm",
// "uhhh"). Not "err" (a verb) or "hmm" (often a real reply), and
// hyphenated forms like "uh-huh" are whole tokens, so they never match.
const HESITATION = /^(?:u+m+|u+h+m*|e+rm+|er)$/i

// A word, keeping hyphens and apostrophes inside it ("uh-huh", "don't").
const WORD = /[\p{L}']+(?:-[\p{L}']+)*/gu

/**
 * "like" is a filler only when the transcript sets it off on both sides —
 * "it was, like, huge" or "Like, I don't know" — never "I like it", "looks
 * like rain" or "like I said". The transcript instruction asks Gemini to
 * punctuate fillers this way.
 */
function isFillerLike(text: string, start: number, end: number): boolean {
	const before = text.slice(0, start).trimEnd()
	const after = text.slice(end).trimStart()
	const setOffBefore = before === '' || /[,.!?;:]$/.test(before)
	return setOffBefore && after.startsWith(',')
}

/**
 * Every clear filler word in a transcript. Segments are timed but words
 * aren't, so a word's time is estimated from where it falls in its
 * segment's text — close enough to land the playhead beside it.
 */
export function detectFillerWords(transcript: Transcript): FillerWord[] {
	const found: FillerWord[] = []
	for (const segment of transcript.segments) {
		const { text, startSeconds, endSeconds } = segment
		for (const match of text.matchAll(WORD)) {
			const word = match[0].toLowerCase()
			const start = match.index
			const isFiller =
				HESITATION.test(word) || (word === 'like' && isFillerLike(text, start, start + word.length))
			if (!isFiller) continue
			const fraction = text.length > 0 ? start / text.length : 0
			found.push({ word, atSeconds: startSeconds + fraction * (endSeconds - startSeconds) })
		}
	}
	return found
}
