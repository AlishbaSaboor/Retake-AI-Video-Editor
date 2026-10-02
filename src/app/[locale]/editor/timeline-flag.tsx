'use client'

import { FillerWordIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { timeToPercent } from './timeline-scale'

export type FlagKind = 'silence' | 'filler' | 'fillerReview'

// Silences and filler words differ in colour, shape and glyph, so the two
// read apart at a glance — not by colour alone. A filler clean-up can't cut
// safely (no clear gap around it) is outlined rather than filled.
const KIND_STYLES: Record<FlagKind, string> = {
	silence: 'bg-warning rounded-full',
	filler: 'bg-filler rounded-sm',
	fillerReview: 'bg-surface text-filler border-filler rounded-sm border-dashed'
}

const FILLER_ICON_SIZE = 10

type TimelineFlagProps = {
	kind: FlagKind
	atSeconds: number
	durationSeconds: number
	/** Says what was found and where, e.g. "Silence from 0:03 to 0:09. Jump there". */
	label: string
	onJump: (seconds: number) => void
}

/** A clickable flag above the track that jumps the playhead to what it marks. */
export function TimelineFlag({
	kind,
	atSeconds,
	durationSeconds,
	label,
	onJump
}: TimelineFlagProps) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className={cn(
				'focus-visible:outline-accent absolute top-7 z-10 flex size-4 -translate-x-1/2 items-center justify-center border border-black text-xs leading-none font-bold text-black shadow-lg transition-transform hover:scale-125 focus-visible:outline-2 motion-reduce:transition-none',
				KIND_STYLES[kind]
			)}
			style={{ left: timeToPercent(atSeconds, durationSeconds) }}
			onClick={() => onJump(atSeconds)}
		>
			{kind === 'silence' ? '!' : <FillerWordIcon size={FILLER_ICON_SIZE} />}
		</button>
	)
}
