// A take's transcript: every word with its measured timing (from Deepgram,
// which keeps fillers like "um"), plus the same words grouped into
// sentence-length lines for the transcript panel.

export type TranscriptWord = {
	/** As spoken, with punctuation where the transcriber added it ("so,", "um,"). */
	text: string
	startSeconds: number
	endSeconds: number
}

export type TranscriptSegment = { startSeconds: number; endSeconds: number; text: string }

export type Transcript = { segments: TranscriptSegment[]; words: TranscriptWord[] }

/** The shape a transcriber's word list arrives in. */
type TimedWord = { word: string; punctuated_word?: string; start: number; end: number }

const SENTENCE_END = /[.?!]["')\]]*$/

/** Builds a transcript from a word list, closing a line at each sentence end. */
export function toTranscript(timedWords: TimedWord[]): Transcript {
	const words: TranscriptWord[] = timedWords.map((w) => ({
		text: w.punctuated_word ?? w.word,
		startSeconds: w.start,
		endSeconds: w.end
	}))
	const segments: TranscriptSegment[] = []
	let line: TranscriptWord[] = []
	const close = () => {
		const first = line[0]
		const last = line.at(-1)
		if (first && last) {
			segments.push({
				startSeconds: first.startSeconds,
				endSeconds: last.endSeconds,
				text: line.map((w) => w.text).join(' ')
			})
		}
		line = []
	}
	for (const word of words) {
		line.push(word)
		if (SENTENCE_END.test(word.text)) close()
	}
	close()
	return { segments, words }
}
