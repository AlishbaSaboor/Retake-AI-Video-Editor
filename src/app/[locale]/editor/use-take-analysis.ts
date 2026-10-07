import { useQuery } from '@tanstack/react-query'
import { ActionFailure, isPlainAiStatus } from '@/lib/ai-failure'
import { transcribeTake } from './actions'
import { detectAudioIssues, type AudioIssue } from './audio-quality'
import { planFillerCut, type FillerPlan } from './filler-cuts'
import { detectFillerWords } from './filler-words'
import {
	ANALYSIS_SAMPLE_RATE,
	analysisSamples,
	decodeAudio,
	detectSilences,
	encodeWav,
	measureLoudness,
	MAX_TRANSCRIBE_SECONDS,
	toBase64,
	type Loudness,
	type Silence
} from './take-audio'
import type { Transcript } from './transcript'

type AudioAnalysis = {
	silences: Silence[]
	/** Clipping, quiet speech and loud background: informational flags, not edits. */
	audioIssues: AudioIssue[]
	/** For placing filler cuts in the real gaps around each filler. */
	loudness: Loudness
	/** Null when the take is longer than MAX_TRANSCRIBE_SECONDS. */
	audioBase64: string | null
}

export type TranscriptState =
	| { status: 'analyzing' | 'no_audio' | 'too_long' | 'transcribing' }
	| { status: 'ready'; transcript: Transcript }
	| { status: 'failed'; error: string; plain: boolean }

const NO_SILENCES: Silence[] = []
const NO_AUDIO_ISSUES: AudioIssue[] = []
const NO_FILLER_PLANS: FillerPlan[] = []

/**
 * Analyses a take as soon as it's loaded: silences and audio problems
 * (audio-quality.ts) are measured locally from the decoded audio, then the
 * same audio goes to Deepgram for a transcript,
 * which filler words are then found in — no second AI call — and each filler
 * is placed against the audio's real gaps (cut) or left for review.
 * Both are keyed by the take's object URL, so replacing the video starts
 * over and nothing is re-run for the same take. A reopened project brings
 * its saved transcript: no second Deepgram call.
 */
export function useTakeAnalysis(
	video: { file: File; url: string; transcript?: Transcript | null } | null
) {
	const audio = useQuery({
		queryKey: ['take-audio', video?.url],
		queryFn: async (): Promise<AudioAnalysis | null> => {
			if (!video) return null
			const decoded = await decodeAudio(video.file)
			if (!decoded) return null
			const samples = await analysisSamples(decoded)
			const loudness = measureLoudness(samples, ANALYSIS_SAMPLE_RATE)
			const tooLong = samples.length / ANALYSIS_SAMPLE_RATE > MAX_TRANSCRIBE_SECONDS
			// Clipping is measured on the decoded audio as it is: mixing to mono
			// at 16 kHz would smear the peaks it looks for.
			const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) =>
				decoded.getChannelData(c)
			)
			return {
				silences: detectSilences(samples, ANALYSIS_SAMPLE_RATE),
				audioIssues: detectAudioIssues(channels, decoded.sampleRate, loudness),
				loudness,
				audioBase64: tooLong ? null : toBase64(encodeWav(samples, ANALYSIS_SAMPLE_RATE))
			}
		},
		enabled: video !== null,
		staleTime: Infinity,
		retry: false
	})

	const audioBase64 = audio.data?.audioBase64 ?? null
	const saved = video?.transcript ?? null
	const transcript = useQuery({
		queryKey: ['take-transcript', video?.url],
		queryFn: async () => {
			if (saved) return saved
			if (!audioBase64) throw new Error('No audio to transcribe')
			const result = await transcribeTake({ audioBase64 })
			if (!result.ok) throw new ActionFailure(result.error, result.status)
			return result.data
		},
		enabled: audioBase64 !== null || (saved !== null && audio.data !== undefined),
		staleTime: Infinity,
		retry: false
	})

	const transcriptState: TranscriptState = audio.isPending
		? { status: 'analyzing' }
		: !audio.data
			? { status: 'no_audio' }
			: !audioBase64 && !saved
				? { status: 'too_long' }
				: transcript.isPending
					? { status: 'transcribing' }
					: transcript.isError
						? {
								status: 'failed',
								error: transcript.error.message,
								// Its message is meant for people: a refused key, a usage limit, a busy AI.
								plain:
									transcript.error instanceof ActionFailure &&
									isPlainAiStatus(transcript.error.status)
							}
						: { status: 'ready', transcript: transcript.data }

	const loudness = audio.data?.loudness
	return {
		/** For the cut editor's waveform; null until the audio is decoded. */
		loudness: loudness ?? null,
		silences: audio.data?.silences ?? NO_SILENCES,
		audioIssues: audio.data?.audioIssues ?? NO_AUDIO_ISSUES,
		fillerPlans:
			transcript.data && loudness
				? detectFillerWords(transcript.data).map((filler) => planFillerCut(filler, loudness))
				: NO_FILLER_PLANS,
		transcript: transcriptState
	}
}
