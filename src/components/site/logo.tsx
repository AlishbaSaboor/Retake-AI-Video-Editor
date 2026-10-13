import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'

/** The mark alone: a take going round again, its dot in the accent. */
export function LogoMark({ className }: { className?: string }) {
	return (
		<svg aria-hidden viewBox="0 0 32 32" fill="none" className={cn('size-7 shrink-0', className)}>
			<path
				d="M26.5 13A11 11 0 1 0 27 19"
				stroke="currentColor"
				strokeWidth="2.6"
				strokeLinecap="round"
			/>
			<path
				d="M27.4 7.6v6.2h-6.2"
				stroke="currentColor"
				strokeWidth="2.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx="16" cy="16" r="3.4" fill="var(--accent)" />
		</svg>
	)
}

/** The wordmark: the mark beside "Retake" in the display face. */
export function Logo({
	href = '/',
	compact = false,
	className
}: {
	href?: string
	/** On a phone, the mark alone (the name is still read out). */
	compact?: boolean
	className?: string
}) {
	return (
		<Link
			href={href}
			className={cn(
				'text-text focus-visible:outline-accent font-display inline-flex items-center gap-2.5 rounded-lg text-[21px] leading-none font-semibold tracking-[-0.03em] focus-visible:outline-2 focus-visible:outline-offset-4',
				className
			)}
		>
			<LogoMark />
			<span className={cn(compact && 'max-sm:sr-only')}>Retake</span>
		</Link>
	)
}
