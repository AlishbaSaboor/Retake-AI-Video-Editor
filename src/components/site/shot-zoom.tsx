'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { CloseIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * A picture that opens full size over the page when clicked. The native
 * dialog closes it with Esc; a click outside the picture closes it too.
 */
export function ShotZoom({
	label,
	full,
	children,
	className
}: {
	/** The button's name: the picture, and what clicking does. */
	label: string
	full: React.ReactNode
	children: React.ReactNode
	className?: string
}) {
	const t = useTranslations('Site.shots')
	const dialogRef = useRef<HTMLDialogElement>(null)
	return (
		<>
			<button
				type="button"
				aria-label={label}
				aria-haspopup="dialog"
				onClick={() => dialogRef.current?.showModal()}
				className={cn(
					'focus-visible:outline-accent block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2',
					className
				)}
			>
				{children}
			</button>
			<dialog
				ref={dialogRef}
				aria-label={label}
				onClick={(event) => {
					// A click on the backdrop lands on the dialog itself.
					if (event.target === event.currentTarget) event.currentTarget.close()
				}}
				className="m-auto max-h-none max-w-none overflow-visible bg-transparent p-0 backdrop:bg-black/80 backdrop:backdrop-blur-sm"
			>
				<div className="relative">
					{full}
					<button
						type="button"
						aria-label={t('close')}
						onClick={() => dialogRef.current?.close()}
						className="text-ink focus-visible:outline-accent absolute -top-4 -right-4 flex size-10 items-center justify-center rounded-full bg-white shadow-lg focus-visible:outline-2"
					>
						<CloseIcon size={18} />
					</button>
				</div>
			</dialog>
		</>
	)
}
