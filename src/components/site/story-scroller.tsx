'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export type StoryStep = {
	id: string
	label: string
	title: string
	body: string
	pill?: string
	/** Which of `screens` shows beside it. */
	screen: number
}

/**
 * The five scenes: a stepper on the left that follows the scroll, each
 * scene's words in the middle (the one being read lit, the rest dimmed), and
 * beside them a picture of the app that changes with the scene. On a phone
 * the scenes simply stack, with the picture once above them.
 */
export function StoryScroller({
	steps,
	screens,
	label
}: {
	steps: StoryStep[]
	screens: React.ReactNode[]
	label: string
}) {
	const [active, setActive] = useState(0)
	const refs = useRef<(HTMLElement | null)[]>([])

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue
					const index = refs.current.indexOf(entry.target as HTMLElement)
					if (index >= 0) setActive(index)
				}
			},
			// A scene is "being read" while it crosses the middle of the window.
			{ rootMargin: '-45% 0px -45% 0px' }
		)
		for (const element of refs.current) if (element) observer.observe(element)
		return () => observer.disconnect()
	}, [])

	const shown = steps[active]?.screen ?? 0
	return (
		<div className="grid gap-10 lg:grid-cols-[190px_minmax(0,360px)_minmax(0,1fr)] lg:gap-14">
			<nav aria-label={label} className="hidden lg:block">
				<div className="sticky top-[38vh]">
					<span aria-hidden className="bg-border absolute top-1 bottom-1 left-[5px] w-0.5" />
					<span
						aria-hidden
						className="absolute top-1 left-[5px] w-0.5 bg-linear-to-b from-(--blue) to-(--accent) transition-[height] duration-500"
						style={{ height: `${(active / Math.max(steps.length - 1, 1)) * 100}%` }}
					/>
					<ol className="flex flex-col gap-5 py-1">
						{steps.map((step, index) => (
							<li key={step.id} className="relative">
								<a
									href={`#story-${step.id}`}
									aria-current={index === active ? 'step' : undefined}
									className={cn(
										'focus-visible:outline-accent flex items-center gap-4 rounded font-mono text-xs tracking-[0.16em] uppercase transition-colors focus-visible:outline-2',
										index === active
											? 'text-text'
											: index < active
												? 'text-text-muted'
												: 'text-text-faint'
									)}
								>
									<span
										aria-hidden
										className={cn(
											'relative size-3 rounded-full border-2 transition-all duration-400',
											index === active
												? 'border-accent bg-accent shadow-[0_0_0_6px_var(--accent-soft)]'
												: index < active
													? 'border-accent bg-accent'
													: 'border-border-strong bg-bg'
										)}
									/>
									{step.label}
								</a>
							</li>
						))}
					</ol>
				</div>
			</nav>
			<div className="lg:hidden">{screens[0]}</div>
			<ol className="flex flex-col">
				{steps.map((step, index) => (
					<li
						key={step.id}
						id={`story-${step.id}`}
						ref={(element) => {
							refs.current[index] = element
						}}
						className={cn(
							'flex scroll-mt-[30vh] flex-col justify-center gap-4 py-10 transition-opacity duration-500 lg:min-h-[78vh] lg:py-0',
							index === active ? 'opacity-100' : 'lg:opacity-35'
						)}
					>
						<span className="text-text-faint font-mono text-xs tracking-[0.16em] uppercase">
							{String(index + 1).padStart(2, '0')} · {step.label}
						</span>
						<h3 className="text-text font-display text-[clamp(28px,3vw,44px)] leading-[0.98] font-medium tracking-[-0.035em]">
							{step.title}
						</h3>
						<p className="text-text-muted max-w-[42ch] text-[17px] leading-[1.55]">{step.body}</p>
						{step.pill && (
							<span className="border-border-strong text-text-muted self-start rounded-full border px-3 py-1 font-mono text-[11.5px] tracking-[0.04em]">
								{step.pill}
							</span>
						)}
					</li>
				))}
			</ol>
			<div className="hidden lg:block">
				<div className="sticky top-[calc(50vh-190px)]">
					<div className="border-border bg-surface relative rounded-[28px] border p-3 shadow-(--shadow-card)">
						<div className="grid">
							{screens.map((screen, index) => (
								<div
									key={index}
									className={cn(
										'col-start-1 row-start-1 transition-opacity duration-500 motion-reduce:transition-none',
										index === shown ? 'opacity-100' : 'opacity-0'
									)}
								>
									{screen}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
