import { cn } from '@/lib/cn'

// The site's type pieces: the small monospaced label over a heading, and the
// large headings in Funnel Display, set tight. A heading never has an italic
// or highlighted word (the design's rule), so a message's `<em>` reads as
// plain text; the kinds stay so each call site keeps its meaning.

export type Emphasis = 'gradient' | 'accent' | 'plain'

/** The `<em>` of a rich message, as plain text. Pass to `t.rich(key, { em: emphasis('accent') })`. */
export function emphasis(kind: Emphasis) {
	function Em(chunks: React.ReactNode) {
		return (
			<em className="not-italic" data-emphasis={kind}>
				{chunks}
			</em>
		)
	}
	return Em
}

/** The small monospaced capitals over a heading, after a short rule. */
export function Eyebrow({
	children,
	className,
	as: Tag = 'p'
}: {
	children: React.ReactNode
	className?: string
	as?: 'p' | 'h2' | 'span'
}) {
	return (
		<Tag
			className={cn(
				'text-text-faint flex items-center gap-2.5 font-mono text-xs tracking-[0.18em] uppercase before:h-px before:w-[22px] before:shrink-0 before:bg-(--border-strong)',
				className
			)}
		>
			{children}
		</Tag>
	)
}

/** Sizes of the display headings, each shrinking smoothly to a phone's width. */
const SIZES = {
	/** The landing page's first line. */
	hero: 'text-[clamp(46px,8vw,124px)] leading-[0.98] tracking-[-0.035em]',
	/** A page's own heading, or a scene's. */
	page: 'text-[clamp(40px,6vw,88px)] leading-[0.98] tracking-[-0.035em]',
	/** A section's heading. */
	section: 'text-[clamp(36px,4.8vw,72px)] leading-[0.98] tracking-[-0.035em]',
	/** A smaller section heading, or a promise. */
	small: 'text-[clamp(30px,4vw,58px)] leading-[0.98] tracking-[-0.035em]'
} as const

/** A large display heading. */
export function DisplayHeading({
	children,
	size = 'section',
	as: Tag = 'h2',
	id,
	className
}: {
	children: React.ReactNode
	size?: keyof typeof SIZES
	as?: 'h1' | 'h2' | 'h3' | 'p'
	id?: string
	className?: string
}) {
	return (
		<Tag
			id={id}
			className={cn('text-text font-display font-medium text-balance', SIZES[size], className)}
		>
			{children}
		</Tag>
	)
}

/** The lead paragraph under a heading. */
export function Lead({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<p
			className={cn(
				'text-text-muted max-w-[56ch] text-[clamp(17px,1.4vw,20px)] leading-[1.55] text-pretty',
				className
			)}
		>
			{children}
		</p>
	)
}

/** A page's opening: the label, the heading and a line under it, set left in the page's column. */
export function PageHero({
	eyebrow,
	title,
	description,
	size = 'page',
	children,
	className
}: {
	eyebrow: string
	title: React.ReactNode
	description?: React.ReactNode
	size?: keyof typeof SIZES
	children?: React.ReactNode
	className?: string
}) {
	return (
		<section
			className={cn(
				'mx-auto w-full max-w-[1240px] px-[clamp(16px,4vw,48px)] pt-[clamp(70px,11vw,150px)] pb-[clamp(48px,7vw,96px)]',
				className
			)}
		>
			<div className="rt-rise flex max-w-[980px] flex-col items-start gap-[22px]">
				<Eyebrow>{eyebrow}</Eyebrow>
				<DisplayHeading as="h1" size={size} className="max-w-[14ch]">
					{title}
				</DisplayHeading>
				{description && <Lead className="mt-1">{description}</Lead>}
				{children}
			</div>
		</section>
	)
}
