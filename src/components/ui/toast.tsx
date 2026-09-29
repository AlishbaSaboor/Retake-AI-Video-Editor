'use client'

import * as ToastPrimitives from '@radix-ui/react-toast'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { CloseIcon } from '@/components/ui/icons'

export const ToastProvider = ToastPrimitives.Provider

export function ToastViewport({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitives.Viewport>) {
	return (
		<ToastPrimitives.Viewport
			className={cn(
				'fixed right-0 bottom-0 z-50 flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-sm',
				className
			)}
			{...props}
		/>
	)
}

const toastVariants = cva(
	'pointer-events-auto relative flex w-full items-start justify-between gap-3 rounded-lg border p-4 shadow-sm transition-opacity data-[state=closed]:opacity-0',
	{
		variants: {
			variant: {
				default: 'border-border bg-surface text-text',
				destructive: 'border-danger bg-surface text-text'
			}
		},
		defaultVariants: { variant: 'default' }
	}
)

export function Toast({
	className,
	variant,
	...props
}: React.ComponentProps<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>) {
	return <ToastPrimitives.Root className={cn(toastVariants({ variant }), className)} {...props} />
}

export function ToastTitle({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitives.Title>) {
	return (
		<ToastPrimitives.Title
			className={cn('text-text text-sm font-semibold', className)}
			{...props}
		/>
	)
}

export function ToastDescription({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitives.Description>) {
	return (
		<ToastPrimitives.Description className={cn('text-text-muted text-sm', className)} {...props} />
	)
}

export function ToastClose({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitives.Close>) {
	return (
		<ToastPrimitives.Close
			aria-label="Dismiss"
			className={cn(
				'text-text-faint hover:text-text shrink-0 rounded',
				'focus-visible:outline-accent focus-visible:outline focus-visible:outline-2',
				className
			)}
			{...props}
		>
			{/* Decorative: the button already carries aria-label="Dismiss". */}
			<CloseIcon />
		</ToastPrimitives.Close>
	)
}
