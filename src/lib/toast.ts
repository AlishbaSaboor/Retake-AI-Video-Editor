'use client'

import { useEffect, useState } from 'react'

export type ToastInput = {
	title?: string
	description?: string
	variant?: 'default' | 'destructive'
}

type ToastItem = ToastInput & { id: string }

// Module-scope, not React state — toast() needs to be callable from
// anywhere (a TanStack Query onError callback, a plain event handler), not
// just from inside a component. useToast() below is the only thing that
// actually subscribes to it for rendering; see src/components/ui/toaster.tsx.
let toasts: ToastItem[] = []
const listeners = new Set<(toasts: ToastItem[]) => void>()
let nextId = 0

const TOAST_DURATION_MS = 5000

function emit() {
	listeners.forEach((listener) => listener(toasts))
}

function dismiss(id: string) {
	toasts = toasts.filter((item) => item.id !== id)
	emit()
}

// Call this — not the Toast/ToastPrimitives components directly — from
// anywhere in the app to show one. Pair with captureError/captureClientError's
// userMessage: `toast({ title: 'Something went wrong', description: userMessage,
// variant: 'destructive' })`. See docs/rules/error-handling.md.
export function toast(input: ToastInput): void {
	const id = String(nextId++)
	toasts = [...toasts, { id, ...input }]
	emit()
	setTimeout(() => dismiss(id), TOAST_DURATION_MS)
}

export function useToast() {
	const [state, setState] = useState<ToastItem[]>(toasts)

	useEffect(() => {
		listeners.add(setState)
		return () => {
			listeners.delete(setState)
		}
	}, [])

	return { toasts: state, dismiss }
}
