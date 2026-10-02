'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SplitIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { Edit } from './cleanup'
import { clipIndexAt, clipPlayedSeconds, type Clip } from './sequence'
import { formatTimecode } from './timeline-scale'

type ClipStripProps = {
	clips: Clip[]
	edit: Edit
	currentTimeSeconds: number
	canSplit: boolean
	onSplit: () => void
}

/**
 * The take as its clips, in playback order, each as wide as it plays for
 * (after trim and cuts). The clip under the playhead is highlighted.
 */
export function ClipStrip({ clips, edit, currentTimeSeconds, canSplit, onSplit }: ClipStripProps) {
	const t = useTranslations('Editor.clips')
	const currentIndex = clipIndexAt(clips, currentTimeSeconds)

	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface rounded-2xl border p-4 shadow-xl"
		>
			<div className="border-border mb-3 flex items-center gap-2 border-b pb-3">
				<h2 className="text-text text-xs font-bold tracking-wider uppercase">{t('label')}</h2>
				<span className="text-text-muted text-xs">{t('count', { count: clips.length })}</span>
				<Button
					variant="outline"
					size="sm"
					className="ml-auto"
					disabled={!canSplit}
					onClick={onSplit}
				>
					<SplitIcon />
					{t('split')}
				</Button>
			</div>
			<ol className="flex gap-1.5">
				{clips.map((clip, index) => {
					const playedSeconds = clipPlayedSeconds(clip, edit)
					const isCurrent = index === currentIndex
					const source = clip.ranges
						.map((r) => `${formatTimecode(r.startSeconds)}–${formatTimecode(r.endSeconds)}`)
						.join(', ')
					return (
						<li
							key={clip.id}
							aria-current={isCurrent || undefined}
							aria-label={t('clipLabel', {
								number: index + 1,
								duration: formatTimecode(playedSeconds),
								source
							})}
							title={t('clipLabel', {
								number: index + 1,
								duration: formatTimecode(playedSeconds),
								source
							})}
							className={cn(
								'flex min-w-16 basis-0 flex-col gap-0.5 rounded-lg border px-3 py-2',
								isCurrent ? 'border-accent bg-accent/10' : 'border-border-strong bg-surface-hover'
							)}
							// Width is proportional to play time; a fully cut clip keeps a sliver.
							style={{ flexGrow: Math.max(playedSeconds, 0.01) }}
						>
							<span className="text-text truncate text-xs font-semibold">
								{t('clipName', { number: index + 1 })}
							</span>
							<span className="text-text-muted font-mono text-xs">
								{formatTimecode(playedSeconds)}
							</span>
						</li>
					)
				})}
			</ol>
		</section>
	)
}
