import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'

/** The wordmark: "Retake" beside a tally light, the dot a camera shows while it records. */
export function Logo({ href = '/', className }: { href?: string; className?: string }) {
	return (
		<Link
			href={href}
			className={cn(
				'font-display text-text focus-visible:outline-accent inline-flex items-center gap-2 rounded-lg text-lg font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4',
				className
			)}
		>
			<span
				aria-hidden
				className="bg-accent shadow-accent-glow size-2.5 rounded-full shadow-[0_0_12px]"
			/>
			Retake
		</Link>
	)
}
