import { cn } from '@/lib/cn'
import { ShotZoom } from './shot-zoom'

// A screenshot of the app, taken from the app itself (e2e/site-shots.ts) in
// both themes at 2x: the one matching the page's theme shows. Both are lazy,
// so the hidden one isn't fetched.

export type ShotName =
	| 'upload'
	| 'say'
	| 'plan'
	| 'studio'
	| 'tidy'
	| 'yours'
	| 'manual'
	| 'assistant'
	| 'share'
	| 'daynight'

/** Each screenshot's size: the design's device slots at 1100 × 710, day and night at 1440 × 930, both at 2x. */
const SIZE: Record<ShotName, { width: number; height: number }> = {
	upload: { width: 2200, height: 1420 },
	say: { width: 2200, height: 1420 },
	plan: { width: 2200, height: 1420 },
	studio: { width: 2200, height: 1420 },
	tidy: { width: 2200, height: 1420 },
	yours: { width: 2200, height: 1420 },
	manual: { width: 2200, height: 1420 },
	assistant: { width: 2200, height: 1420 },
	share: { width: 2200, height: 1420 },
	daynight: { width: 2880, height: 1860 }
}

export function Shot({
	name,
	alt,
	theme,
	priority = false,
	className
}: {
	name: ShotName
	alt: string
	/** One theme only, whatever the page's (the day-and-night comparison). */
	theme?: 'dark' | 'light'
	/** Above the fold: load it straight away. */
	priority?: boolean
	className?: string
}) {
	const image = (variant: 'dark' | 'light', shownClass: string) => (
		// eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP from the shots script; nothing to optimise.
		<img
			src={`/site/shots/${name}-${variant}.webp`}
			alt={alt}
			width={SIZE[name].width}
			height={SIZE[name].height}
			loading={priority ? 'eager' : 'lazy'}
			decoding="async"
			className={cn('block h-auto w-full', shownClass, className)}
		/>
	)
	if (theme) return image(theme, '')
	return (
		<>
			{image('dark', 'shot-dark')}
			{image('light', 'shot-light')}
		</>
	)
}

/**
 * A screenshot in a design slot that opens full size when clicked: the slot
 * keeps the design's size, and the full picture is a click away.
 */
export function ZoomShot({
	name,
	alt,
	label,
	className
}: {
	name: ShotName
	alt: string
	/** What clicking does ("Open full size"), said after the picture's own words. */
	label: string
	className?: string
}) {
	return (
		<ShotZoom
			label={`${alt} ${label}`}
			className={className}
			full={<Shot name={name} alt={alt} className="max-h-[90vh] w-auto max-w-[94vw]" />}
		>
			<Shot name={name} alt={alt} />
		</ShotZoom>
	)
}

/** The rounded device a picture of the app sits in, with a soft glow behind. */
export function Device({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				'border-border-strong bg-surface-raised relative rounded-[30px] border p-3 shadow-(--shadow-card)',
				className
			)}
		>
			<span
				aria-hidden
				className="bg-accent-glow pointer-events-none absolute -inset-8 -z-10 rounded-full opacity-60 blur-3xl"
			/>
			{children}
		</div>
	)
}
