'use client'

import { useTranslations } from 'next-intl'
import type { Silence } from './take-audio'
import { formatTimecode, timeToPercent } from './timeline-scale'

type SilencePinProps = {
	silence: Silence
	durationSeconds: number
	onJump: (seconds: number) => void
}

/** A flag above the track at the start of a silence; click to jump there. */
export function SilencePin({ silence, durationSeconds, onJump }: SilencePinProps) {
	const t = useTranslations('Editor.timeline')
	const start = formatTimecode(silence.startSeconds)
	const end = formatTimecode(silence.endSeconds)
	return (
		<button
			type="button"
			aria-label={t('silencePinLabel', { start, end })}
			title={t('silencePinLabel', { start, end })}
			className="bg-warning focus-visible:outline-accent absolute top-7 z-10 flex size-4 -translate-x-1/2 items-center justify-center rounded-full border border-black text-xs leading-none font-bold text-black shadow-lg transition-transform hover:scale-125 focus-visible:outline-2 motion-reduce:transition-none"
			style={{ left: timeToPercent(silence.startSeconds, durationSeconds) }}
			onClick={() => onJump(silence.startSeconds)}
		>
			!
		</button>
	)
}
