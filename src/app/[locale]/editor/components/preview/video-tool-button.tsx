'use client'

/** A button on the bar over the video: an icon, its name said and shown on hover. */
export function VideoToolButton({
	label,
	pressed,
	onClick,
	children
}: {
	label: string
	pressed: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			onClick={onClick}
			className="text-text-muted hover:bg-surface-hover hover:text-text aria-pressed:bg-surface-hover aria-pressed:text-text focus-visible:outline-accent inline-flex size-8 items-center justify-center rounded-md focus-visible:outline-2"
		>
			{children}
		</button>
	)
}
