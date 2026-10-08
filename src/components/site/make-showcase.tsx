'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { CompareSlider } from './compare-slider'

export type MakeStyle = {
	id: string
	tab: string
	after: string
	said: string
	/** The style's edit, as Retake exported it (public/site/clip). */
	video: string
	/** Its first frame, sharp: shown until it plays, or instead under reduced motion. */
	poster: string
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
	beforeVideo,
	beforePoster,
	beforeAlt,
	afterAlt,
	compare
}: {
	heading: React.ReactNode
	styles: MakeStyle[]
	stylesLabel: string
	before: string
	beforeVideo: string
	beforePoster: string
	beforeAlt: string
	afterAlt: string
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
						<LoopVideo
							src={beforeVideo}
							poster={beforePoster}
							label={beforeAlt}
							className="size-full object-cover"
						/>
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
							<LoopVideo
								src={style.video}
								poster={style.poster}
								label={afterAlt}
								className="absolute inset-0 size-full object-cover"
							/>
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

/**
 * A short silent clip on a loop. It plays by itself unless the visitor asks
 * for less motion; then it shows its first frame, with controls to play it.
 */
function LoopVideo({
	src,
	poster,
	label,
	className
}: {
	src: string
	poster: string
	label: string
	className?: string
}) {
	const ref = useRef<HTMLVideoElement>(null)
	const [still, setStill] = useState(false)
	useEffect(() => {
		const video = ref.current
		if (!video) return
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
		const apply = () => {
			setStill(reduce.matches)
			if (reduce.matches) video.pause()
			else void video.play().catch(() => undefined)
		}
		apply()
		reduce.addEventListener('change', apply)
		return () => reduce.removeEventListener('change', apply)
	}, [])
	return (
		<video
			ref={ref}
			src={src}
			poster={poster}
			muted
			loop
			playsInline
			preload="metadata"
			controls={still}
			aria-label={label}
			className={className}
		/>
	)
}
