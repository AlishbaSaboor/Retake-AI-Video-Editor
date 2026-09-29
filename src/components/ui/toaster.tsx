'use client'

import { useToast } from '@/lib/toast'
import {
	Toast,
	ToastClose,
	ToastDescription,
	ToastProvider,
	ToastTitle,
	ToastViewport
} from '@/components/ui/toast'

// Mounted once in the root layout. Call toast() from src/lib/toast.ts
// anywhere in the app to show one — nothing else to wire up per call site.
export function Toaster() {
	const { toasts, dismiss } = useToast()

	return (
		<ToastProvider>
			{toasts.map(({ id, title, description, variant }) => (
				<Toast key={id} variant={variant} onOpenChange={(open) => !open && dismiss(id)}>
					<div className="grid gap-1">
						{title && <ToastTitle>{title}</ToastTitle>}
						{description && <ToastDescription>{description}</ToastDescription>}
					</div>
					<ToastClose />
				</Toast>
			))}
			<ToastViewport />
		</ToastProvider>
	)
}
