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
						className="bg-brand-wide absolute top-1 left-[5px] w-0.5 transition-[height] duration-500"
						style={{ height: `${(active / Math.max(steps.length - 1, 1)) * 100}%` }}
					/>
					<ol className="flex flex-col gap-5 py-1">
						{steps.map((step, index) => (
							<li key={step.id} className="relative">
								<a
									href={`#story-${step.id}`}
									aria-current={index === active ? 'step' : undefined}
									className={cn(
										'focus-visible:outline-accent flex items-center gap-4 rounded text-[13px] font-extrabold tracking-[0.18em] uppercase transition-colors focus-visible:outline-2',
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
											'relative size-3 rounded-full transition-all',
											index === active
												? 'bg-brand-blue scale-125 shadow-[0_0_0_7px_rgb(76_125_255/0.22)]'
												: index < active
													? 'bg-accent'
													: 'bg-border-strong'
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
						<span className="text-accent-fg text-[13px] font-extrabold tracking-[0.22em] uppercase">
							{String(index + 1).padStart(2, '0')} · {step.label}
						</span>
						<h3 className="text-text font-serif text-[clamp(38px,4.2vw,54px)] leading-[1.02] tracking-[-0.01em]">
							{step.title}
						</h3>
						<p className="text-text-muted text-[17px] leading-[1.7]">{step.body}</p>
						{step.pill && (
							<span className="bg-surface-hover text-text-muted self-start rounded-full px-3.5 py-2 text-sm font-bold">
								{step.pill}
							</span>
						)}
					</li>
				))}
			</ol>
			<div className="hidden lg:block">
				<div className="sticky top-[calc(50vh-190px)]">
					<div className="border-border-strong bg-surface-raised relative rounded-[30px] border p-3 shadow-(--shadow-card)">
						<span
							aria-hidden
							className="bg-accent-glow pointer-events-none absolute -inset-10 -z-10 rounded-full blur-3xl"
						/>
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
