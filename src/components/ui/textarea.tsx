import { cn } from '@/lib/cn'

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
	return (
		<textarea
			className={cn(
				'border-border bg-surface text-text min-h-20 w-full rounded border px-3 py-2 text-sm',
				'placeholder:text-text-faint',
				'focus-visible:outline-accent focus-visible:outline focus-visible:outline-2',
				'disabled:cursor-not-allowed disabled:opacity-50',
				className
			)}
			{...props}
		/>
	)
}
