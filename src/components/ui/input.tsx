import { cn } from '@/lib/cn'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
	return (
		<input
			className={cn(
				'border-border bg-surface-inset text-text hover:border-border-strong h-9 w-full rounded-lg border px-3 text-sm transition-colors',
				'placeholder:text-text-faint',
				'focus-visible:outline-accent focus-visible:outline focus-visible:outline-2',
				'disabled:cursor-not-allowed disabled:opacity-50',
				className
			)}
			{...props}
		/>
	)
}
