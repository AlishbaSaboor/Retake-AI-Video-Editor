import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'

/** The mark alone: a take going round again, on the brand gradient. */
export function LogoMark({ className }: { className?: string }) {
	return (
		<span
			aria-hidden
			className={cn(
				'bg-brand-wide flex size-[30px] shrink-0 items-center justify-center rounded-[10px]',
				className
			)}
		>
			<svg width="18" height="18" viewBox="0 0 30 30" fill="none">
				<path
					d="M21.5 11.2A7.5 7.5 0 1 0 22.5 15"
					stroke="#fff"
					strokeWidth="2.6"
					strokeLinecap="round"
				/>
				<path
					d="M22.4 7.4v4.4H18"
					stroke="#fff"
					strokeWidth="2.6"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<circle cx="15" cy="15" r="3" fill="#fff" />
			</svg>
		</span>
	)
}

/** The wordmark: the mark beside "Retake" in the display serif. */
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
				'text-text focus-visible:outline-accent inline-flex items-center gap-2.5 rounded-lg font-serif text-[26px] leading-none tracking-[-0.01em] focus-visible:outline-2 focus-visible:outline-offset-4',
				className
			)}
		>
			<LogoMark />
			<span className={cn(compact && 'max-sm:sr-only')}>Retake</span>
		</Link>
	)
}
