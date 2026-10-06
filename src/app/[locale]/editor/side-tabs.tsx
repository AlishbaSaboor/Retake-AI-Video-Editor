'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'

type SideTab = 'assistant' | 'transcript'

/**
 * The right-hand column: the assistant (the chat) and the transcript, a tab
 * each. Both stay mounted, so the chat's history and a half-typed command
 * survive a look at the transcript.
 */
export function SideTabs({
	tab,
	onTab,
	transcriptCount,
	assistant,
	transcript
}: {
	tab: SideTab
	onTab: (tab: SideTab) => void
	/** How many sentences the transcript has; null until it's in. */
	transcriptCount: number | null
	assistant: React.ReactNode
	transcript: React.ReactNode
}) {
	const t = useTranslations('Editor.side')
	const tabs: SideTab[] = ['assistant', 'transcript']
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div
				role="tablist"
				aria-label={t('label')}
				className="border-border grid shrink-0 grid-cols-2 gap-1 border-b p-2"
			>
				{tabs.map((each) => (
					<button
						key={each}
						type="button"
						role="tab"
						id={`side-tab-${each}`}
						aria-selected={tab === each}
						aria-controls={`side-panel-${each}`}
						onClick={() => onTab(each)}
						className={cn(
							'focus-visible:outline-accent inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2',
							tab === each
								? 'bg-surface-hover text-text'
								: 'text-text-muted hover:bg-surface-hover hover:text-text'
						)}
					>
						{t(each)}
						{each === 'transcript' && transcriptCount !== null && (
							<span
								aria-label={t('sentences', { count: transcriptCount })}
								className="bg-accent-soft text-accent rounded-full px-1.5 font-mono text-[11px]"
							>
								{transcriptCount}
							</span>
						)}
					</button>
				))}
			</div>
			{tabs.map((each) => (
				<div
					key={each}
					id={`side-panel-${each}`}
					role="tabpanel"
					aria-labelledby={`side-tab-${each}`}
					hidden={tab !== each}
					className={cn(
						'min-h-0 flex-1 flex-col',
						tab === each && 'flex',
						each === 'transcript' && 'overflow-y-auto p-3'
					)}
				>
					{each === 'assistant' ? assistant : transcript}
				</div>
			))}
		</div>
	)
}
