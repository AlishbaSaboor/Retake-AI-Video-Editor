'use client'

import { useTranslations } from 'next-intl'
import { MicIcon, SpinnerIcon } from '@/components/ui/icons'
import type { SourceRange } from './sequence'
import { formatTimecode } from './timeline-scale'
import type { TranscriptSegment } from './transcript'
import type { TranscriptState } from './use-take-analysis'

type TranscriptPanelProps = {
	state: TranscriptState
	onSeek: (seconds: number) => void
	/** Opens re-recording for a sentence; without it, sentences can't be re-recorded. */
	onReRecord?: (sentence: TranscriptSegment) => void
	/** Spans already re-recorded, so their sentences can be marked. */
	replacedSpans: SourceRange[]
}

/** The take's transcript, generated on upload; click a line to jump there. */
export function TranscriptPanel({
	state,
	onSeek,
	onReRecord,
	replacedSpans
}: TranscriptPanelProps) {
	const t = useTranslations('Editor.transcript')

	return (
		<section className="border-border bg-surface rounded-lg border p-4">
			<h2 className="text-text border-border mb-3 border-b pb-3 text-xs font-bold tracking-wider uppercase">
				{t('title')}
			</h2>
			{state.status === 'ready' && state.transcript.segments.length > 0 ? (
				<ol className="flex max-h-72 flex-col gap-1 overflow-y-auto">
					{state.transcript.segments.map((segment) => {
						const middle = (segment.startSeconds + segment.endSeconds) / 2
						const isReplaced = replacedSpans.some(
							(span) => middle > span.startSeconds && middle < span.endSeconds
						)
						return (
							<li key={segment.startSeconds} className="flex items-start gap-1">
								<button
									type="button"
									onClick={() => onSeek(segment.startSeconds)}
									className="hover:bg-surface-hover focus-visible:outline-accent flex min-w-0 flex-1 gap-3 rounded-lg px-2 py-1.5 text-left text-sm focus-visible:outline-2"
								>
									<span className="text-accent-secondary shrink-0 font-mono text-xs leading-5">
										{formatTimecode(segment.startSeconds)}
									</span>
									<span className="text-text">
										{segment.text}
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
							</li>
						)
					})}
				</ol>
			) : (
				<p className="text-text-muted flex items-center gap-2 text-sm" role="status">
					{(state.status === 'analyzing' || state.status === 'transcribing') && <SpinnerIcon />}
					{state.status === 'failed'
						? state.error
						: t(state.status === 'ready' ? 'empty' : state.status)}
				</p>
			)}
		</section>
	)
}
