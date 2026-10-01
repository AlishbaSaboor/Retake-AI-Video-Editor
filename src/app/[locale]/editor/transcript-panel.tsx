'use client'

import { useTranslations } from 'next-intl'
import { SpinnerIcon } from '@/components/ui/icons'
import { formatTimecode } from './timeline-scale'
import type { TranscriptState } from './use-take-analysis'

type TranscriptPanelProps = {
	state: TranscriptState
	onSeek: (seconds: number) => void
}

/** The take's transcript, generated on upload; click a line to jump there. */
export function TranscriptPanel({ state, onSeek }: TranscriptPanelProps) {
	const t = useTranslations('Editor.transcript')

	return (
		<section className="border-border bg-surface rounded-2xl border p-4 shadow-xl">
			<h2 className="text-text border-border mb-3 border-b pb-3 text-xs font-bold tracking-wider uppercase">
				{t('title')}
			</h2>
			{state.status === 'ready' && state.transcript.segments.length > 0 ? (
				<ol className="flex max-h-72 flex-col gap-1 overflow-y-auto">
					{state.transcript.segments.map((segment) => (
						<li key={segment.startSeconds}>
							<button
								type="button"
								onClick={() => onSeek(segment.startSeconds)}
								className="hover:bg-surface-hover focus-visible:outline-accent flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm focus-visible:outline-2"
							>
								<span className="text-accent-secondary shrink-0 font-mono text-xs leading-5">
									{formatTimecode(segment.startSeconds)}
								</span>
								<span className="text-text">{segment.text}</span>
							</button>
						</li>
					))}
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
