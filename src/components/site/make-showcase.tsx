'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { CompareSlider } from './compare-slider'
import { SeaScene } from './scenes'

export type MakeStyle = {
	id: string
	tab: string
	after: string
	/** The title on the finished vertical edit, its <em> already styled. */
	card: React.ReactNode
	said: string
}

/**
 * Make it, shown: pick a style and drag between the raw clip and what
 * Retake made of it. The tabs are a radio group, so the arrow keys move
 * between them.
 */
export function MakeShowcase({
	heading,
	styles,
	stylesLabel,
	before,
	compare
}: {
	heading: React.ReactNode
	styles: MakeStyle[]
	stylesLabel: string
	before: string
	compare: string
}) {
	const [picked, setPicked] = useState(0)
	const style = styles[picked] ?? styles[0]
	if (!style) return null
	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
				{heading}
				<div
					role="radiogroup"
					aria-label={stylesLabel}
					className="border-glass-border bg-glass flex self-start rounded-full border p-1.5 md:self-auto"
				>
					{styles.map((each, index) => (
						<button
							key={each.id}
							type="button"
							role="radio"
							aria-checked={index === picked}
							tabIndex={index === picked ? 0 : -1}
							onClick={() => setPicked(index)}
							onKeyDown={(event) => {
								const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
								if (!step) return
								event.preventDefault()
								const next = (index + step + styles.length) % styles.length
								setPicked(next)
								const sibling = event.currentTarget.parentElement?.children[next]
								if (sibling instanceof HTMLElement) sibling.focus()
							}}
							className={cn(
								'focus-visible:outline-accent h-10 rounded-full px-4 text-[15px] font-bold transition-colors focus-visible:outline-2 sm:px-[18px]',
								index === picked
									? 'bg-contrast text-contrast-ink'
									: 'text-text hover:bg-surface-hover'
							)}
						>
							{each.tab}
						</button>
					))}
				</div>
			</div>
			<CompareSlider
				label={compare}
				className="aspect-[4/3] rounded-[28px] shadow-(--shadow-card) sm:aspect-[16/9]"
				before={
					<div className="relative size-full">
						<SeaScene id="make-before" className="grayscale-[0.6]" />
						<span className="absolute top-4 left-4 rounded-full bg-black/80 px-3 py-1.5 text-[13px] font-bold text-white">
							{before}
						</span>
					</div>
				}
				after={
					<div className="bg-night relative flex size-full items-center justify-center bg-[radial-gradient(50%_60%_at_50%_70%,rgb(76_125_255/0.35),transparent_70%)]">
						<div
							key={style.id}
							className="rt-fade-in relative flex aspect-[9/16] h-[86%] flex-col justify-end overflow-hidden rounded-2xl border border-white/20 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)]"
						>
							<SeaScene id={`make-after-${style.id}`} className="absolute inset-0" />
							<span className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />
							<span className="relative p-5 font-serif text-[clamp(18px,2.4vw,30px)] leading-tight text-white">
								{style.card}
							</span>
						</div>
						<span className="text-ink absolute top-4 right-4 rounded-full bg-white/90 px-3 py-1.5 text-[13px] font-bold">
							{style.after}
						</span>
					</div>
				}
			/>
			<p className="text-text-faint text-center text-sm">{style.said}</p>
		</div>
	)
}
