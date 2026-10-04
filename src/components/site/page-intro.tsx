import { cn } from '@/lib/cn'

/** A page's heading block: a small label, the title, and a line under it. */
export function PageIntro({
	eyebrow,
	title,
	description,
	className
}: {
	eyebrow: string
	title: string
	description?: string
	className?: string
}) {
	return (
		<div className={cn('flex max-w-2xl flex-col gap-3', className)}>
			<p className="text-accent font-mono text-xs font-medium tracking-widest uppercase">
				{eyebrow}
			</p>
			<h1 className="font-display text-text text-4xl font-bold tracking-tight text-balance md:text-5xl">
				{title}
			</h1>
			{description && (
				<p className="text-text-muted text-lg leading-relaxed text-pretty">{description}</p>
			)}
		</div>
	)
}
