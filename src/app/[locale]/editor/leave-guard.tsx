'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useRouter } from '@/i18n/routing'

/**
 * Asks before an unsaved edit is lost. Closing or reloading the tab gets the
 * browser's own "Leave site?" prompt; a link out of the editor (the top
 * bar's New project or Projects, the logo) gets "Leave without saving?"
 * first. Only while `unsaved`.
 */
export function LeaveGuard({ unsaved }: { unsaved: boolean }) {
	const t = useTranslations('Editor.leave')
	const router = useRouter()
	const dialogRef = useRef<HTMLDialogElement>(null)
	const [leavingTo, setLeavingTo] = useState<string | null>(null)

	useEffect(() => {
		if (!unsaved) return
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault()
			// Older browsers show the prompt only when returnValue is set.
			event.returnValue = ''
		}
		// In the capture phase, so the link's own (client-side) navigation never starts.
		const intercept = (event: MouseEvent) => {
			if (event.defaultPrevented || event.button !== 0) return
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
			const link = event.target instanceof Element ? event.target.closest('a[href]') : null
			if (
				!(link instanceof HTMLAnchorElement) ||
				link.target === '_blank' ||
				link.hasAttribute('download')
			)
				return
			const url = new URL(link.href, window.location.href)
			const here = window.location
			if (
				url.origin !== here.origin ||
				(url.pathname === here.pathname && url.search === here.search)
			)
				return
			event.preventDefault()
			event.stopPropagation()
			setLeavingTo(`${url.pathname}${url.search}${url.hash}`)
			dialogRef.current?.showModal()
		}
		window.addEventListener('beforeunload', warn)
		document.addEventListener('click', intercept, true)
		return () => {
			window.removeEventListener('beforeunload', warn)
			document.removeEventListener('click', intercept, true)
		}
	}, [unsaved])

	function leave() {
		dialogRef.current?.close()
		if (leavingTo) router.push(leavingTo)
	}

	return (
		<dialog
			ref={dialogRef}
			aria-labelledby="leave-title"
			aria-describedby="leave-body"
			className="border-border bg-surface text-text m-auto w-[min(24rem,calc(100vw-2rem))] rounded-lg border p-0 shadow-2xl backdrop:bg-black/60"
			onClose={() => setLeavingTo(null)}
		>
			<div className="flex flex-col gap-3 p-5">
				<h2 id="leave-title" className="font-display text-lg font-semibold">
					{t('title')}
				</h2>
				<p id="leave-body" className="text-text-muted text-sm">
					{t('body')}
				</p>
				<div className="mt-2 flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						autoFocus
						onClick={() => dialogRef.current?.close()}
					>
						{t('stay')}
					</Button>
					<Button type="button" variant="destructive" onClick={leave}>
						{t('leave')}
					</Button>
				</div>
			</div>
		</dialog>
	)
}
