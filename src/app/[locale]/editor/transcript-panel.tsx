'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { MicIcon, PauseIcon, SpinnerIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { AudioIssue } from './audio-quality'
import type { FillerPlan } from './filler-cuts'
import type { SourceRange } from './sequence'
import type { Silence } from './take-audio'
import { formatTimecode } from './timeline-scale'
import type { TranscriptSegment, TranscriptWord } from './transcript'
import type { TranscriptState } from './use-take-analysis'

type Flag = 'fillers' | 'pauses' | 'audio'

type TranscriptPanelProps = {
	state: TranscriptState
	onSeek: (seconds: number) => void
	/** Opens re-recording for a sentence; without it, sentences can't be re-recorded. */
	onReRecord?: (sentence: TranscriptSegment) => void
	/** Spans already re-recorded, so their sentences can be marked. */
	replacedSpans: SourceRange[]
	/** What the recording's checks found, flagged where it is in the transcript. */
	silences?: Silence[]
	fillerPlans?: FillerPlan[]
	audioIssues?: AudioIssue[]
}

const overlaps = (a: SourceRange, b: SourceRange) =>
	a.startSeconds < b.endSeconds && b.startSeconds < a.endSeconds

/**
 * The take's transcript, generated on upload: click a sentence to jump
 * there, or re-record it. What the checks found is flagged in place: filler
 * words highlighted (outlined when they need a cut by hand), long pauses
 * between sentences, and stretches of bad audio under the sentence they're
 * in; each pause and problem jumps there. The chips at the top count each
 * kind and show only the sentences with it.
 */
export function TranscriptPanel({
	state,
	onSeek,
	onReRecord,
	replacedSpans,
	silences = [],
	fillerPlans = [],
	audioIssues = []
}: TranscriptPanelProps) {
	const t = useTranslations('Editor.transcript')
	const tl = useTranslations('Editor.timeline')
	const [only, setOnly] = useState<Flag | null>(null)

	if (state.status !== 'ready' || state.transcript.segments.length === 0) {
		return (
			<p className="text-text-muted flex items-center gap-2 p-1 text-sm" role="status">
				{(state.status === 'analyzing' || state.status === 'transcribing') && <SpinnerIcon />}
				{state.status === 'failed'
					? state.error
					: t(state.status === 'ready' ? 'empty' : state.status)}
			</p>
		)
	}

	const { segments, words } = state.transcript
	const fillerAt = (word: TranscriptWord) =>
		fillerPlans.find((plan) => Math.abs(plan.filler.startSeconds - word.startSeconds) < 0.02)
	// A pause belongs after the sentence it follows: the last one starting before it.
	const pauseAfter = (index: number) => {
		const segment = segments[index]
		const next = segments[index + 1]
		if (!segment) return []
		return silences.filter(
			(silence) =>
				silence.startSeconds >= segment.startSeconds &&
				(!next || silence.startSeconds < next.startSeconds)
		)
	}
	const counts: Record<Flag, number> = {
		fillers: fillerPlans.length,
		pauses: silences.length,
		audio: audioIssues.length
	}
	const shows = (index: number, segment: TranscriptSegment) =>
		only === null ||
		(only === 'fillers' && fillerPlans.some((plan) => overlaps(plan.filler, segment))) ||
		(only === 'pauses' && pauseAfter(index).length > 0) ||
		(only === 'audio' && audioIssues.some((issue) => overlaps(issue, segment)))

	return (
		<section aria-label={t('title')} className="flex flex-col gap-3">
			{(counts.fillers > 0 || counts.pauses > 0 || counts.audio > 0) && (
				<div role="group" aria-label={t('flags')} className="flex flex-wrap gap-1.5">
					{(['fillers', 'pauses', 'audio'] as const).map(
						(flag) =>
							counts[flag] > 0 && (
								<button
									key={flag}
									type="button"
									aria-pressed={only === flag}
									onClick={() => setOnly(only === flag ? null : flag)}
									className={cn(
										'focus-visible:outline-accent rounded-full border px-2.5 py-1 text-xs font-medium focus-visible:outline-2',
										FLAG_LOOKS[flag],
										only === flag && 'ring-2 ring-current'
									)}
								>
									{t(`chips.${flag}`, { count: counts[flag] })}
								</button>
							)
					)}
				</div>
			)}
			<ol className="flex flex-col gap-1">
				{segments.map((segment, index) => {
					if (!shows(index, segment)) return null
					const middle = (segment.startSeconds + segment.endSeconds) / 2
					const isReplaced = replacedSpans.some(
						(span) => middle > span.startSeconds && middle < span.endSeconds
					)
					const inSentence = words.filter(
						(word) =>
							word.startSeconds >= segment.startSeconds && word.startSeconds < segment.endSeconds
					)
					const issues = audioIssues.filter((issue) => overlaps(issue, segment))
					return (
						<li key={segment.startSeconds} className="flex flex-col gap-1">
							<div className="flex items-start gap-1">
								<button
									type="button"
									onClick={() => onSeek(segment.startSeconds)}
									className="hover:bg-surface-hover focus-visible:outline-accent flex min-w-0 flex-1 gap-3 rounded-lg px-2 py-1.5 text-left text-sm focus-visible:outline-2"
								>
									<span className="text-accent-secondary shrink-0 font-mono text-xs leading-5">
										{formatTimecode(segment.startSeconds)}
									</span>
									<span className="text-text">
										{inSentence.length > 0
											? inSentence.map((word, at) => {
													const filler = fillerAt(word)
													return (
														<span key={word.startSeconds}>
															{at > 0 && ' '}
															{filler ? (
																<mark
																	title={t(filler.kind === 'cut' ? 'filler' : 'fillerReview')}
																	className={cn(
																		'text-filler rounded px-1',
																		filler.kind === 'cut'
																			? 'bg-filler/15'
																			: 'border-filler border border-dashed bg-transparent'
																	)}
																>
																	{word.text}
																</mark>
															) : (
																word.text
															)}
														</span>
													)
												})
											: segment.text}
										{isReplaced && (
											<span className="text-accent ml-2 text-xs font-medium">{t('replaced')}</span>
										)}
									</span>
								</button>
								{onReRecord && (
									<button
										type="button"
										onClick={() => onReRecord(segment)}
										aria-label={t('reRecord', { at: formatTimecode(segment.startSeconds) })}
										title={t('reRecord', { at: formatTimecode(segment.startSeconds) })}
										className="text-text-muted hover:text-text hover:bg-surface-hover focus-visible:outline-accent shrink-0 rounded-lg p-2 focus-visible:outline-2"
									>
										<MicIcon />
									</button>
								)}
							</div>
							{issues.length > 0 && (
								<div className="flex flex-wrap gap-1.5 pl-14">
									{issues.map((issue) => (
										<button
											key={`${issue.kind}-${issue.startSeconds}`}
											type="button"
											title={tl(`audio.${issue.kind}.meaning`)}
											onClick={() => onSeek(issue.startSeconds)}
											className="border-danger/40 bg-danger/10 text-danger focus-visible:outline-accent rounded-full border px-2 py-0.5 text-xs focus-visible:outline-2"
										>
											{t(`issues.${issue.kind}`, { at: formatTimecode(issue.startSeconds) })}
										</button>
									))}
								</div>
							)}
							{pauseAfter(index).map((silence) => (
								<button
									key={`pause-${silence.startSeconds}`}
									type="button"
									onClick={() => onSeek(silence.startSeconds)}
									className="bg-surface-inset text-text-muted hover:text-text focus-visible:outline-accent ml-14 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs focus-visible:outline-2"
								>
									<PauseIcon size={12} />
									{t('pause', {
										seconds: (silence.endSeconds - silence.startSeconds).toFixed(1),
										at: formatTimecode(silence.startSeconds)
									})}
								</button>
							))}
						</li>
					)
				})}
			</ol>
		</section>
	)
}

const FLAG_LOOKS: Record<Flag, string> = {
	fillers: 'border-filler/40 bg-filler/10 text-filler',
	pauses: 'border-warning/40 bg-warning/10 text-warning',
	audio: 'border-danger/40 bg-danger/10 text-danger'
}
