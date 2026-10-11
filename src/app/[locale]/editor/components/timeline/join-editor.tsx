'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { LoudnessTrack } from './loudness-track'
import type { Joins } from '../../audio/sentence-splice'
import type { SourceRange } from '../../model/sequence'
import type { Loudness } from '../../audio/take-audio'
import { formatTimecode } from '../../model/timeline-scale'

type JoinEditorProps = {
	joins: Joins
	/** What each join's waveform shows (joinViews); a handle stays inside its own. */
	views: { start: SourceRange; end: SourceRange }
	loudness: Loudness
	currentTimeSeconds: number
	onMove: (edge: 'start' | 'end', seconds: number) => void
	/** Plays the original take across one view, to hear where the join falls. */
	onPlay: (view: SourceRange) => void
}

/**
 * Setting a sentence's joins by ear: a zoomed waveform around its start and
 * one around its end, each with a handle, the replaced side shaded. Same
 * waveform and handles as the filler cut editor.
 */
export function JoinEditor({
	joins,
	views,
	loudness,
	currentTimeSeconds,
	onMove,
	onPlay
}: JoinEditorProps) {
	const t = useTranslations('Editor.reRecord.join')
	return (
		<div className="flex flex-col gap-3">
			<p className="text-text-muted text-xs">{t('hint')}</p>
			{(['start', 'end'] as const).map((edge) => {
				const view = views[edge]
				const seconds = edge === 'start' ? joins.startSeconds : joins.endSeconds
				return (
					<div key={edge} className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<span className="text-text text-xs font-medium">
								{t(`${edge}.label`, { at: formatTimecode(seconds) })}
							</span>
							<Button variant="outline" size="sm" className="ml-auto" onClick={() => onPlay(view)}>
								{t(`${edge}.play`)}
							</Button>
						</div>
						<LoudnessTrack
							loudness={loudness}
							window={view}
							// The new take plays from the start join to the end join.
							marked={joins}
							markedClassName="border-accent/70 bg-accent/20"
							currentTimeSeconds={currentTimeSeconds}
							handles={[{ edge, seconds, label: t(`${edge}.handle`) }]}
							onHandleChange={onMove}
						/>
					</div>
				)
			})}
		</div>
	)
}
