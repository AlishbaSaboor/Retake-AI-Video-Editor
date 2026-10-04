'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { KeyboardIcon } from '@/components/ui/icons'

/** The editor's keyboard shortcuts, as shown in the help list (and handled in video-editor.tsx). */
export const SHORTCUTS = [
	{ keys: ['Space'], action: 'play' },
	{ keys: ['S'], action: 'split' },
	{ keys: ['Delete'], action: 'delete' },
	{ keys: ['Ctrl', 'Z'], action: 'undo' },
	{ keys: ['Ctrl', 'Shift', 'Z'], action: 'redo' },
	{ keys: ['['], action: 'chat' },
	{ keys: [']'], action: 'tools' },
	{ keys: ['/'], action: 'find' },
	{ keys: ['?'], action: 'help' }
] as const

/** Opens the help list from elsewhere (the ? key): the dialog listens for it. */
export const OPEN_SHORTCUTS_EVENT = 'retake:open-shortcuts'

/** A button for the shortcut list, which opens as a dialog. */
export function ShortcutsHelp() {
	const t = useTranslations('Editor.shortcuts')
	const dialogRef = useRef<HTMLDialogElement>(null)

	useEffect(() => {
		const open = () => dialogRef.current?.showModal()
		window.addEventListener(OPEN_SHORTCUTS_EVENT, open)
		return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, open)
	}, [])

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={t('button')}
				title={`${t('button')} (?)`}
				onClick={() => dialogRef.current?.showModal()}
			>
				<KeyboardIcon size={18} />
			</Button>
			<dialog
				ref={dialogRef}
				aria-labelledby="shortcuts-title"
				className="border-border bg-surface text-text m-auto w-[min(26rem,calc(100vw-2rem))] rounded-lg border p-0 shadow-2xl backdrop:bg-black/60"
				// A click on the backdrop (the dialog itself, outside its content) closes it.
				onClick={(event) => {
					if (event.target === event.currentTarget) event.currentTarget.close()
				}}
			>
				<div className="flex flex-col gap-4 p-5">
					<h2 id="shortcuts-title" className="font-display text-lg font-semibold">
						{t('title')}
					</h2>
					<dl className="flex flex-col gap-2">
						{SHORTCUTS.map(({ keys, action }) => (
							<div key={action} className="flex items-center justify-between gap-4 text-sm">
								<dt className="text-text-muted">{t(action)}</dt>
								<dd className="flex shrink-0 gap-1">
									{keys.map((key) => (
										<kbd
											key={key}
											className="border-border bg-surface-inset text-text rounded-md border px-1.5 py-0.5 font-mono text-xs"
										>
											{key}
										</kbd>
									))}
								</dd>
							</div>
						))}
					</dl>
					<Button
						type="button"
						variant="outline"
						className="self-end"
						onClick={() => dialogRef.current?.close()}
					>
						{t('close')}
					</Button>
				</div>
			</dialog>
		</>
	)
}
