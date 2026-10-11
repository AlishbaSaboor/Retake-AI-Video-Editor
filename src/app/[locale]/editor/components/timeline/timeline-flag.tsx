'use client'

import { ClippingIcon, FillerWordIcon, NoiseIcon, QuietIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { AudioIssueKind } from '../../audio/audio-quality'
import { timeToPercent } from '../../model/timeline-scale'

export type FlagKind = 'silence' | 'filler' | 'fillerReview' | AudioIssueKind

// Each kind differs in colour, shape and glyph, so they read apart at a
// glance — not by colour alone. A filler clean-up can't cut safely (no
// clear gap around it) is outlined rather than filled. Audio problems
// (clipping, quiet speech, loud background) only point something out.
const KIND_STYLES: Record<FlagKind, string> = {
	silence: 'bg-warning rounded-full',
	filler: 'bg-filler rounded-sm',
	fillerReview: 'bg-surface text-filler border-filler rounded-sm border-dashed',
	clipping: 'bg-danger rounded-sm',
	quiet: 'bg-surface text-text border-text-muted rounded-full',
	noise: 'bg-accent-secondary rounded-sm'
}

const GLYPH_SIZE = 10

const GLYPHS: Record<FlagKind, React.ReactNode> = {
	silence: '!',
	filler: <FillerWordIcon size={GLYPH_SIZE} />,
	fillerReview: <FillerWordIcon size={GLYPH_SIZE} />,
	clipping: <ClippingIcon size={GLYPH_SIZE} />,
	quiet: <QuietIcon size={GLYPH_SIZE} />,
	noise: <NoiseIcon size={GLYPH_SIZE} />
}

type TimelineFlagProps = {
	kind: FlagKind
	atSeconds: number
	durationSeconds: number
	/** Says what was found and where, e.g. "Silence from 0:03 to 0:09. Jump there". */
	label: string
	onJump: (seconds: number) => void
	/** Vertical placement; defaults to above the main track. */
	className?: string
}

/** A clickable flag above the track that jumps the playhead to what it marks. */
export function TimelineFlag({
	kind,
	atSeconds,
	durationSeconds,
	label,
	onJump,
	className = 'top-7'
}: TimelineFlagProps) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className={cn(
				'focus-visible:outline-accent absolute z-10 flex size-4 -translate-x-1/2 items-center justify-center border border-black text-xs leading-none font-bold text-black shadow-lg transition-transform hover:scale-125 focus-visible:outline-2 motion-reduce:transition-none',
				KIND_STYLES[kind],
				className
			)}
			style={{ left: timeToPercent(atSeconds, durationSeconds) }}
			onClick={() => onJump(atSeconds)}
		>
			{GLYPHS[kind]}
		</button>
	)
}
