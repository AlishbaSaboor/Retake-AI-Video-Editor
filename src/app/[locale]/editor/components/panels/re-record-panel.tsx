'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { MicIcon, SpinnerIcon } from '@/components/ui/icons'
import { toast } from '@/lib/toast'
import { captureClientError } from '@/lib/observability/capture-client-error'
import {
	inputLevelPercent,
	prepareTake,
	type ReplacementTake,
	type ReRecordBlocker
} from '../../audio/re-record'
import type { SplicePlan } from '../../audio/sentence-splice'
import type { Loudness } from '../../audio/take-audio'
import { formatTimecode } from '../../model/timeline-scale'
import type { TranscriptSegment } from '../../audio/transcript'

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
	/** Offered when the sentence has no clean pause on a side: set the joins by listening instead. */
	onSetByEar?: () => void
	/** The by-ear join editor, once the joins are being set by ear. */
	children?: React.ReactNode
}

/**
 * Re-record one sentence: say it again into the mic, listen to the original
 * and the new take in place, then use it or cancel. Nothing changes until
 * the take is applied. A sentence with no clean pause can have its joins
 * set by ear first; such a join is not promised to be clean, and the panel
 * says so.
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
	onCancel,
	onSetByEar,
	children
}: ReRecordPanelProps) {
	const t = useTranslations('Editor.reRecord')
	const [status, setStatus] = useState<
		'idle' | 'recording' | 'processing' | 'no_speech' | 'stopped_mid_speech'
	>('idle')
	const recorderRef = useRef<MediaRecorder | null>(null)
	// The input meter's bar, and what stops it. The bar is resized on every
	// animation frame straight on the element, not through state, so the
	// panel doesn't re-render sixty times a second.
	const meterRef = useRef<HTMLDivElement>(null)
	const stopMeterRef = useRef<(() => void) | null>(null)

	// Closing the panel mid-recording releases the mic without keeping the take.
	useEffect(
		() => () => {
			stopMeterRef.current?.()
			const recorder = recorderRef.current
			if (!recorder) return
			recorder.onstop = null
			recorder.stop()
			for (const track of recorder.stream.getTracks()) track.stop()
		},
		[]
	)

	/** Shows the mic's level live while recording, so a too-quiet take is caught before it's made. */
	function startMeter(stream: MediaStream) {
		const audio = new AudioContext()
		// Created after awaiting the mic, so possibly suspended: a suspended
		// context feeds the analyser silence.
		void audio.resume()
		const analyser = audio.createAnalyser()
		audio.createMediaStreamSource(stream).connect(analyser)
		const samples = new Float32Array(analyser.fftSize)
		let frame = 0
		const draw = () => {
			analyser.getFloatTimeDomainData(samples)
			const percent = inputLevelPercent(samples)
			const bar = meterRef.current
			if (bar) {
				bar.style.width = `${percent}%`
				bar.parentElement?.setAttribute('aria-valuenow', String(percent))
			}
			frame = requestAnimationFrame(draw)
		}
		draw()
		stopMeterRef.current = () => {
			stopMeterRef.current = null
			cancelAnimationFrame(frame)
			void audio.close()
		}
	}

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
			stopMeterRef.current?.()
			for (const track of stream.getTracks()) track.stop()
			void finishTake(new Blob(chunks, { type: recorder.mimeType }))
		}
		recorderRef.current = recorder
		recorder.start()
		startMeter(stream)
		onTake(null)
		setStatus('recording')
	}

	async function finishTake(recording: Blob) {
		if (plan.kind !== 'splice') return
		setStatus('processing')
		let prepared: Awaited<ReturnType<typeof prepareTake>>
		try {
			prepared = await prepareTake(recording, plan, loudness)
		} catch (error) {
			const { userMessage } = captureClientError(error, { feature: 're_record' })
			toast({ variant: 'destructive', title: t('failed'), description: userMessage })
			setStatus('idle')
			return
		}
		if (typeof prepared === 'string') {
			onTake(null)
			setStatus(prepared)
			return
		}
		onTake(prepared)
		setStatus('idle')
	}

	const originalSeconds = plan.kind === 'splice' ? plan.endSeconds - plan.startSeconds : 0

	return (
		<section
			aria-label={t('label', { at: formatTimecode(sentence.startSeconds) })}
			className="border-accent/40 bg-surface rounded-lg border p-4"
		>
			<div className="mb-3 flex flex-col gap-1">
				<h2 className="text-text text-xs font-bold tracking-wider uppercase">
					{t('title', { at: formatTimecode(sentence.startSeconds) })}
				</h2>
				<p className="text-text text-sm">{t('original', { text: sentence.text })}</p>
				<p className="text-text-muted text-xs">{blocker ? t(`blocked.${blocker}`) : t('hint')}</p>
				{plan.kind === 'splice' && plan.byEar && (
					<p className="text-warning text-xs">{t('byEarNote')}</p>
				)}
			</div>
			{children && <div className="mb-3">{children}</div>}
			<div className="flex flex-wrap items-center gap-2" role="status">
				{status === 'recording' && (
					<div className="mr-auto flex items-center gap-2">
						<div
							role="meter"
							aria-label={t('inputLevel')}
							aria-valuemin={0}
							aria-valuemax={100}
							// Starts at 0; the meter loop updates it with the bar's width.
							aria-valuenow={0}
							className="bg-surface-inset h-2 w-24 overflow-hidden rounded-full"
						>
							<div ref={meterRef} className="bg-accent h-full w-0" />
						</div>
						<span className="text-danger text-xs">{t('recording')}</span>
					</div>
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
				{status === 'stopped_mid_speech' && (
					<span className="text-warning mr-auto text-xs">{t('stoppedMidSpeech')}</span>
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
				{onSetByEar && (
					<Button variant="outline" size="sm" onClick={onSetByEar}>
						{t('setByEar')}
					</Button>
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
