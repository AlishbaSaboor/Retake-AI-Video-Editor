'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { MicIcon, SpinnerIcon } from '@/components/ui/icons'
import { toast } from '@/lib/toast'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { prepareTake, type ReplacementTake, type ReRecordBlocker } from './re-record'
import type { SplicePlan } from './sentence-splice'
import type { Loudness } from './take-audio'
import { formatTimecode } from './timeline-scale'
import type { TranscriptSegment } from './transcript'

// Auto gain would ride the level the editor matches itself, so it's off.
// Noise suppression stays on: without it, a real laptop-mic take's
// background measured 15-21 dB louder than the original's at both joins.
const MIC_CONSTRAINTS: MediaTrackConstraints = { autoGainControl: false }

type ReRecordPanelProps = {
	sentence: TranscriptSegment
	plan: SplicePlan
	/** Why this sentence can't be re-recorded right now, or null. */
	blocker: ReRecordBlocker | null
	/** The original take's loudness, to match the new take's level to. */
	loudness: Loudness
	/** The take recorded so far, waiting to be applied. */
	take: ReplacementTake | null
	onTake: (take: ReplacementTake | null) => void
	onPlay: (withTake: boolean) => void
	onApply: () => void
	onCancel: () => void
}

/**
 * Re-record one sentence: say it again into the mic, listen to the original
 * and the new take in place, then use it or cancel. Nothing changes until
 * the take is applied.
 */
export function ReRecordPanel({
	sentence,
	plan,
	blocker,
	loudness,
	take,
	onTake,
	onPlay,
	onApply,
	onCancel
}: ReRecordPanelProps) {
	const t = useTranslations('Editor.reRecord')
	const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'no_speech'>('idle')
	const recorderRef = useRef<MediaRecorder | null>(null)

	// Closing the panel mid-recording releases the mic without keeping the take.
	useEffect(
		() => () => {
			const recorder = recorderRef.current
			if (!recorder) return
			recorder.onstop = null
			recorder.stop()
			for (const track of recorder.stream.getTracks()) track.stop()
		},
		[]
	)

	async function startRecording() {
		let stream: MediaStream
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS })
		} catch {
			// Blocked permission or no microphone: the user's setup, not a bug.
			toast({
				variant: 'destructive',
				title: t('micUnavailable.title'),
				description: t('micUnavailable.description')
			})
			return
		}
		const recorder = new MediaRecorder(stream)
		const chunks: Blob[] = []
		recorder.ondataavailable = (event) => chunks.push(event.data)
		recorder.onstop = () => {
			recorderRef.current = null
			for (const track of stream.getTracks()) track.stop()
			void finishTake(new Blob(chunks, { type: recorder.mimeType }))
		}
		recorderRef.current = recorder
		recorder.start()
		onTake(null)
		setStatus('recording')
	}

	async function finishTake(recording: Blob) {
		if (plan.kind !== 'splice') return
		setStatus('processing')
		let prepared: ReplacementTake | null
		try {
			prepared = await prepareTake(recording, plan, loudness)
		} catch (error) {
			const { userMessage } = captureClientError(error, { feature: 're_record' })
			toast({ variant: 'destructive', title: t('failed'), description: userMessage })
			setStatus('idle')
			return
		}
		onTake(prepared)
		setStatus(prepared ? 'idle' : 'no_speech')
	}

	const originalSeconds = plan.kind === 'splice' ? plan.endSeconds - plan.startSeconds : 0

	return (
		<section
			aria-label={t('label', { at: formatTimecode(sentence.startSeconds) })}
			className="border-accent/40 bg-surface rounded-2xl border p-4 shadow-xl"
		>
			<div className="mb-3 flex flex-col gap-1">
				<h2 className="text-text text-xs font-bold tracking-wider uppercase">
					{t('title', { at: formatTimecode(sentence.startSeconds) })}
				</h2>
				<p className="text-text text-sm">{t('original', { text: sentence.text })}</p>
				<p className="text-text-muted text-xs">{blocker ? t(`blocked.${blocker}`) : t('hint')}</p>
			</div>
			<div className="flex flex-wrap items-center gap-2" role="status">
				{status === 'recording' && (
					<span className="text-danger mr-auto text-xs">{t('recording')}</span>
				)}
				{status === 'processing' && (
					<span className="text-text-muted mr-auto flex items-center gap-2 text-xs">
						<SpinnerIcon />
						{t('processing')}
					</span>
				)}
				{status === 'no_speech' && (
					<span className="text-warning mr-auto text-xs">{t('noSpeech')}</span>
				)}
				{status === 'idle' && take && (
					<span className="text-text-muted mr-auto font-mono text-xs">
						{t('take', {
							seconds: take.takeSeconds.toFixed(1),
							original: originalSeconds.toFixed(1)
						})}
					</span>
				)}
				{status === 'recording' ? (
					<Button size="sm" variant="destructive" onClick={() => recorderRef.current?.stop()}>
						{t('stop')}
					</Button>
				) : (
					<Button
						size="sm"
						variant={take ? 'outline' : 'primary'}
						disabled={blocker !== null || status === 'processing'}
						onClick={startRecording}
					>
						<MicIcon />
						{take ? t('recordAgain') : t('record')}
					</Button>
				)}
				{take && status === 'idle' && (
					<>
						<Button variant="outline" size="sm" onClick={() => onPlay(false)}>
							{t('playOriginal')}
						</Button>
						<Button variant="outline" size="sm" onClick={() => onPlay(true)}>
							{t('playWithTake')}
						</Button>
					</>
				)}
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t('cancel')}
				</Button>
				{take && status === 'idle' && (
					<Button size="sm" onClick={onApply}>
						{t('apply')}
					</Button>
				)}
			</div>
		</section>
	)
}
