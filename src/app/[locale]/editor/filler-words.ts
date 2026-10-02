import type { Transcript, TranscriptWord } from './transcript'

// Filler words, found in the transcript the take already has — no extra AI
// call. Deliberately narrow: a missed "um" costs the user a second of
// scrubbing; flagging normal speech teaches them to ignore the flags.

export type FillerWord = {
	/** Lower-case, without punctuation: "um", "uhh", "like". */
	word: string
	/** The transcriber's timing for the word: close, but not cut-precise. */
	startSeconds: number
	endSeconds: number
}

// Hesitation sounds that are never real words, any length ("ummm",
// "uhhh"). Not "err" (a verb) or "hmm" (often a real reply), and
// hyphenated forms like "uh-huh" are one word, so they never match.
const HESITATION = /^(?:u+m+|u+h+m*|e+rm+|er)$/

const bare = (text: string) => text.toLowerCase().replace(/[^\p{L}'-]/gu, '')

/**
 * "like" is a filler only when the transcript sets it off on both sides —
 * "it was, like, huge" or "Like, I don't know" — never "I like it", "looks
 * like rain" or "like I said".
 */
function isFillerLike(word: TranscriptWord, previous: TranscriptWord | undefined): boolean {
	const setOffBefore = !previous || /[,.!?;:]$/.test(previous.text)
	return setOffBefore && /,$/.test(word.text)
}

/** Every clear filler word in a transcript, with the transcriber's timing. */
export function detectFillerWords(transcript: Transcript): FillerWord[] {
	return transcript.words.flatMap((word, index) => {
		const text = bare(word.text)
		const isFiller =
			HESITATION.test(text) || (text === 'like' && isFillerLike(word, transcript.words[index - 1]))
		return isFiller
			? [{ word: text, startSeconds: word.startSeconds, endSeconds: word.endSeconds }]
			: []
	})
}
