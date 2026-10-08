'use client'

import { useState } from 'react'
import { CompareIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

const START = 50

/**
 * Two pictures of the same thing, one over the other, split by a handle you
 * drag (or move with the arrow keys): `before` on the left of it, `after` on
 * the right. The handle is a real range input, so it works by keyboard and
 * is read out with its label.
 */
export function CompareSlider({
	before,
	after,
	label,
	className
}: {
	before: React.ReactNode
	after: React.ReactNode
	label: string
	className?: string
}) {
	const [position, setPosition] = useState(START)
	return (
		<div className={cn('relative isolate overflow-hidden', className)}>
			<div className="absolute inset-0">{after}</div>
			<div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
				{before}
			</div>
			<span
				aria-hidden
				className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-white"
				style={{ left: `${position}%` }}
			>
				<span className="text-ink absolute top-1/2 left-1/2 flex size-[52px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-sm font-extrabold shadow-[0_0_0_6px_rgb(255_255_255/0.18),0_10px_30px_rgb(0_0_0/0.4)]">
					<CompareIcon size={20} />
				</span>
			</span>
			<input
				type="range"
				min={0}
				max={100}
				value={position}
				onChange={(event) => setPosition(Number(event.target.value))}
				aria-label={label}
				className="peer absolute inset-0 z-20 size-full cursor-ew-resize opacity-0"
			/>
			<span
				aria-hidden
				className="peer-focus-visible:outline-accent pointer-events-none absolute inset-0 z-30 rounded-[inherit] peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2"
			/>
		</div>
	)
}
