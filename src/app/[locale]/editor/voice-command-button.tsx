'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MicIcon, SpinnerIcon, StopIcon } from '@/components/ui/icons'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { transcribeVoiceCommand } from './actions'
import {
	ANALYSIS_SAMPLE_RATE,
	analysisSamples,
	decodeAudio,
	encodeWav,
	toBase64
} from './take-audio'
import { MAX_VOICE_COMMAND_SECONDS } from './voice-command'

type State = 'idle' | 'recording' | 'transcribing'

/** A recording as text: decoded, mixed to 16 kHz mono, capped in length, and sent to Deepgram. */
async function voiceToText(recording: Blob) {
	const decoded = await decodeAudio(recording)
	if (!decoded) throw new Error('voice recording could not be decoded')
	const samples = (await analysisSamples(decoded)).subarray(
		0,
		MAX_VOICE_COMMAND_SECONDS * ANALYSIS_SAMPLE_RATE
	)
	return transcribeVoiceCommand({ audioBase64: toBase64(encodeWav(samples, ANALYSIS_SAMPLE_RATE)) })
}

/**
 * Speak a command: click to record, click again to stop (or it stops itself
 * at MAX_VOICE_COMMAND_SECONDS). Deepgram turns it into text, handed to
 * `onText`, which puts it where a typed command goes: nothing runs from it
 * on its own.
 */
export function VoiceCommandButton({
	onText,
	disabled,
	className
}: {
	onText: (text: string) => void
	disabled?: boolean
	className?: string
}) {
	const t = useTranslations('Editor.voice')
	const [state, setState] = useState<State>('idle')
	const [seconds, setSeconds] = useState(0)
	const recorderRef = useRef<MediaRecorder | null>(null)

	// A recording in progress when the button goes away is dropped, not sent,
	// and its mic released.
	useEffect(
		() => () => {
			const recorder = recorderRef.current
			if (!recorder) return
			recorder.onstop = () => {
				for (const track of recorder.stream.getTracks()) track.stop()
			}
			recorder.stop()
		},
		[]
	)

	useEffect(() => {
		if (state !== 'recording') return
		const started = Date.now()
		const tick = setInterval(() => {
			const elapsed = (Date.now() - started) / 1000
			setSeconds(Math.floor(elapsed))
			if (elapsed >= MAX_VOICE_COMMAND_SECONDS) recorderRef.current?.stop()
		}, 250)
		return () => clearInterval(tick)
	}, [state])

	async function transcribe(recording: Blob) {
		setState('transcribing')
		const result = await voiceToText(recording).catch((error: unknown) => {
			const { userMessage } = captureClientError(error, { feature: 'voice_command' })
			return { ok: false as const, error: userMessage }
		})
		setState('idle')
		if (!result.ok) {
			toast({ variant: 'destructive', title: t('failed'), description: result.error })
			return
		}
		const text = result.data.trim()
		if (text) onText(text)
		else toast({ title: t('nothingHeard') })
	}

	async function start() {
		let stream: MediaStream
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true })
		} catch {
			toast({
				variant: 'destructive',
				title: t('noMic.title'),
				description: t('noMic.description')
			})
			return
		}
		const recorder = new MediaRecorder(stream)
		const chunks: Blob[] = []
		recorder.ondataavailable = (event) => chunks.push(event.data)
		recorder.onstop = () => {
			for (const track of stream.getTracks()) track.stop()
			recorderRef.current = null
			void transcribe(new Blob(chunks, { type: recorder.mimeType }))
		}
		recorderRef.current = recorder
		recorder.start()
		setSeconds(0)
		setState('recording')
	}

	const recording = state === 'recording'
	return (
		<button
			type="button"
			aria-label={recording ? t('stop') : t('start')}
			aria-pressed={recording}
			title={recording ? t('stop') : t('start')}
			disabled={disabled || state === 'transcribing'}
			onClick={() => (recording ? recorderRef.current?.stop() : void start())}
			className={cn(
				'focus-visible:outline-accent inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 disabled:opacity-50',
				recording
					? 'bg-danger text-white'
					: 'text-text-muted hover:bg-surface-hover hover:text-text',
				className
			)}
		>
			{state === 'transcribing' ? (
				<SpinnerIcon size={18} />
			) : recording ? (
				<>
					<StopIcon size={16} />
					<span className="font-mono text-xs tabular-nums">
						{t('elapsed', { seconds, max: MAX_VOICE_COMMAND_SECONDS })}
					</span>
				</>
			) : (
				<MicIcon size={18} />
			)}
			{state === 'transcribing' && <span className="sr-only">{t('transcribing')}</span>}
		</button>
	)
}
