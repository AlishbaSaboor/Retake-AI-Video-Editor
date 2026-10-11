'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { EditIcon, SaveIcon } from '@/components/ui/icons'
import { SaveBadge } from './editor-status'
import type { SaveStatus } from '../panels/project-panel'

/**
 * The project's name at the top of the editor, edited in place: it reads as
 * a title until clicked. Next to it, Save for a project never saved, then
 * whether it's saved (it saves itself after each change from then on). A
 * saved project renamed is saved under its new name at once. Render with a
 * `key` that follows the project, so the field starts from its name.
 */
export function ProjectTitle({
	name,
	suggestedName,
	status,
	savedAt,
	onSave
}: {
	/** The project's name once saved; null for an edit never saved. */
	name: string | null
	/** What it's called until named: the video's name. */
	suggestedName: string
	status: SaveStatus
	savedAt: number | null
	onSave: (name: string) => void
}) {
	const t = useTranslations('Editor.projects')
	const [typed, setTyped] = useState(name ?? suggestedName)
	const trimmed = typed.trim()

	/** The name as typed: kept, and saved under it if the project is saved already. */
	function commit() {
		if (!trimmed) return setTyped(name ?? suggestedName)
		if (name !== null && trimmed !== name) onSave(trimmed)
	}

	return (
		<form
			className="flex min-w-0 items-center gap-2"
			onSubmit={(event) => {
				event.preventDefault()
				if (!trimmed) return
				// Enter names it; a project never saved is saved under that name.
				if (name === null) onSave(trimmed)
				else commit()
				event.currentTarget.querySelector('input')?.blur()
			}}
		>
			<label className="group relative flex min-w-0 items-center">
				<span className="sr-only">{t('name')}</span>
				<input
					value={typed}
					onChange={(event) => setTyped(event.target.value)}
					onBlur={commit}
					aria-label={t('name')}
					title={t('rename')}
					size={Math.max(6, Math.min(typed.length + 1, 28))}
					className="font-display text-text hover:border-border focus-visible:border-accent focus-visible:bg-surface-inset min-w-24 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-base font-semibold transition-colors focus-visible:outline-none"
				/>
				<EditIcon
					size={14}
					className="text-text-faint pointer-events-none -ml-6 opacity-0 transition-opacity group-focus-within:opacity-0 group-hover:opacity-100"
				/>
			</label>
			{name === null && status !== 'saving' ? (
				<Button type="submit" size="sm" variant="outline" disabled={!trimmed}>
					<SaveIcon />
					{t('save')}
				</Button>
			) : (
				<SaveBadge status={status} savedAt={savedAt} />
			)}
		</form>
	)
}
