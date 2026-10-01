import { useQuery } from '@tanstack/react-query'
import { transcribeTake } from './actions'
import { detectFillerWords, type FillerWord } from './filler-words'
import {
	ANALYSIS_SAMPLE_RATE,
	decodeTakeAudio,
	detectSilences,
	encodeWav,
	MAX_TRANSCRIBE_SECONDS,
	toBase64,
	type Silence
} from './take-audio'
import type { Transcript } from './transcript'

type AudioAnalysis = {
	silences: Silence[]
	/** Null when the take is longer than MAX_TRANSCRIBE_SECONDS. */
	audioBase64: string | null
}

export type TranscriptState =
	| { status: 'analyzing' | 'no_audio' | 'too_long' | 'transcribing' }
	| { status: 'ready'; transcript: Transcript }
	| { status: 'failed'; error: string }

const NO_SILENCES: Silence[] = []
const NO_FILLER_WORDS: FillerWord[] = []

/**
 * Analyses a take as soon as it's loaded: silences are measured locally from
 * the decoded audio, then the same audio goes to Gemini for a transcript,
 * which filler words are then found in — no second AI call.
 * Both are keyed by the take's object URL, so replacing the video starts
 * over and nothing is re-run for the same take.
 */
export function useTakeAnalysis(video: { file: File; url: string } | null) {
	const audio = useQuery({
		queryKey: ['take-audio', video?.url],
		queryFn: async (): Promise<AudioAnalysis | null> => {
			if (!video) return null
			const samples = await decodeTakeAudio(video.file)
			if (!samples) return null
			const tooLong = samples.length / ANALYSIS_SAMPLE_RATE > MAX_TRANSCRIBE_SECONDS
			return {
				silences: detectSilences(samples, ANALYSIS_SAMPLE_RATE),
				audioBase64: tooLong ? null : toBase64(encodeWav(samples, ANALYSIS_SAMPLE_RATE))
			}
		},
		enabled: video !== null,
		staleTime: Infinity,
		retry: false
	})

	const audioBase64 = audio.data?.audioBase64 ?? null
	const transcript = useQuery({
		queryKey: ['take-transcript', video?.url],
		queryFn: async () => {
			if (!audioBase64) throw new Error('No audio to transcribe')
			const result = await transcribeTake({ audioBase64 })
			if (!result.ok) throw new Error(result.error)
			return result.data
		},
		enabled: audioBase64 !== null,
		staleTime: Infinity,
		retry: false
	})

	const transcriptState: TranscriptState = audio.isPending
		? { status: 'analyzing' }
		: !audio.data
			? { status: 'no_audio' }
			: !audioBase64
				? { status: 'too_long' }
				: transcript.isPending
					? { status: 'transcribing' }
					: transcript.isError
						? { status: 'failed', error: transcript.error.message }
						: { status: 'ready', transcript: transcript.data }

	return {
		silences: audio.data?.silences ?? NO_SILENCES,
		fillerWords: transcript.data ? detectFillerWords(transcript.data) : NO_FILLER_WORDS,
		transcript: transcriptState
	}
}
