'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { StoryScroller, type StoryStep } from './story-scroller'

export type Path = {
	id: string
	name: string
	steps: StoryStep[]
	screens: React.ReactNode[]
}

/**
 * How it works: two paths to the same end, one shown at a time. The switch
 * is a radio group of two pills; each path scrolls through its own steps.
 */
export function PathSwitcher({
	paths,
	label,
	stepsLabel
}: {
	paths: Path[]
	label: string
	stepsLabel: string
}) {
	const [picked, setPicked] = useState(0)
	const path = paths[picked] ?? paths[0]
	if (!path) return null
	return (
		<>
			<div
				role="radiogroup"
				aria-label={label}
				className="border-glass-border bg-glass mx-auto -mt-6 mb-10 flex w-fit rounded-full border p-1"
			>
				{paths.map((each, index) => (
					<button
						key={each.id}
						type="button"
						role="radio"
						aria-checked={index === picked}
						tabIndex={index === picked ? 0 : -1}
						onClick={() => setPicked(index)}
						onKeyDown={(event) => {
							if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
							event.preventDefault()
							const next = (index + 1) % paths.length
							setPicked(next)
							const sibling = event.currentTarget.parentElement?.children[next]
							if (sibling instanceof HTMLElement) sibling.focus()
						}}
						className={cn(
							'focus-visible:outline-accent h-12 rounded-full px-6 text-base font-bold transition-colors focus-visible:outline-2',
							index === picked
								? 'bg-contrast text-contrast-ink'
								: 'text-text hover:bg-surface-hover'
						)}
					>
						{each.name}
					</button>
				))}
			</div>
			<StoryScroller key={path.id} label={stepsLabel} steps={path.steps} screens={path.screens} />
		</>
	)
}
