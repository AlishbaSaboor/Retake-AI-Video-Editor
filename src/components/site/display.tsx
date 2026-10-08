import { cn } from '@/lib/cn'

// The site's type pieces: the small spaced label over a heading, and the
// large serif headings with one italic phrase (`<em>` in the message),
// coloured three ways across the design: the moving brand gradient, the
// light accent, or plain.

export type Emphasis = 'gradient' | 'accent' | 'plain'

const EM: Record<Emphasis, string> = {
	gradient: 'text-gradient rt-sheen',
	accent: 'text-accent-fg',
	plain: ''
}

/** The `<em>` of a rich message, styled. Pass to `t.rich(key, { em: emphasis('accent') })`. */
export function emphasis(kind: Emphasis) {
	function Em(chunks: React.ReactNode) {
		return <em className={cn('italic', EM[kind])}>{chunks}</em>
	}
	return Em
}

/** The small spaced capitals over a heading. */
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
				'text-accent-fg text-[13px] leading-[1.6] font-extrabold tracking-[0.22em] uppercase',
				className
			)}
		>
			{children}
		</Tag>
	)
}

/** Sizes of the serif headings, each shrinking smoothly to a phone's width. */
const SIZES = {
	/** The landing page's first line. */
	hero: 'text-[clamp(52px,10vw,128px)] leading-[0.92] tracking-[-0.02em]',
	/** A page's own heading. */
	page: 'text-[clamp(48px,7.5vw,96px)] leading-[0.98] tracking-[-0.015em]',
	/** A section's heading. */
	section: 'text-[clamp(40px,5.5vw,76px)] leading-none tracking-[-0.015em]',
	/** A smaller section heading. */
	small: 'text-[clamp(36px,4.8vw,64px)] leading-none'
} as const

/** A large serif heading. */
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
			className={cn('text-text font-serif font-normal text-balance', SIZES[size], className)}
		>
			{children}
		</Tag>
	)
}

/** A page's opening: the label, the heading and a line under it, centred over a soft glow. */
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
				'bg-glow -mt-[76px] flex flex-col items-center px-5 pt-[clamp(140px,14vw,206px)] pb-16 text-center',
				className
			)}
		>
			<div className="rt-rise flex max-w-[860px] flex-col items-center gap-3.5">
				<Eyebrow>{eyebrow}</Eyebrow>
				<DisplayHeading as="h1" size={size}>
					{title}
				</DisplayHeading>
				{description && (
					<p className="text-text-muted mt-3 max-w-[520px] text-[19px] leading-[1.6] text-pretty">
						{description}
					</p>
				)}
				{children}
			</div>
		</section>
	)
}
