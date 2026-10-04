'use client'

import { useId, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MediaRef, ProjectSummary } from './projects'

export type SaveStatus = 'unsaved' | 'saving' | 'saved' | 'failed'

type ProjectPanelProps = {
	/** The project being edited, once saved; null for an edit never saved. */
	name: string | null
	/** What a first save is called unless renamed: the video's name. */
	suggestedName: string
	status: SaveStatus
	savedAt: number | null
	onSave: (name: string) => void
	projects: ProjectSummary[]
	onOpen: (id: string) => void
	onDelete: (id: string) => void
}

/**
 * The project: its name, Save (once saved, it saves itself after each
 * change), and My projects to reopen or delete one. Render with a `key`
 * that follows the project, so its name field starts from the saved name.
 */
export function ProjectPanel({
	name,
	suggestedName,
	status,
	savedAt,
	onSave,
	projects,
	onOpen,
	onDelete
}: ProjectPanelProps) {
	const t = useTranslations('Editor.projects')
	const format = useFormatter()
	const id = useId()
	const [typed, setTyped] = useState(name ?? suggestedName)
	const [listOpen, setListOpen] = useState(false)
	const trimmed = typed.trim()
	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4"
		>
			<form
				className="flex flex-wrap items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault()
					if (trimmed) onSave(trimmed)
				}}
			>
				<div className="flex min-w-48 flex-1 flex-col gap-1">
					<Label htmlFor={`${id}-name`}>{t('name')}</Label>
					<Input
						id={`${id}-name`}
						value={typed}
						onChange={(event) => setTyped(event.target.value)}
					/>
				</div>
				<Button type="submit" size="sm" disabled={!trimmed || status === 'saving'}>
					{t('save')}
				</Button>
				<Button
					type="button"
					size="sm"
					variant={listOpen ? 'secondary' : 'outline'}
					aria-expanded={listOpen}
					onClick={() => setListOpen(!listOpen)}
				>
					{t('myProjects')}
				</Button>
				<p role="status" className="text-text-muted pb-2 text-xs">
					{status === 'saved' && savedAt !== null
						? t('savedAt', { time: format.dateTime(savedAt, { timeStyle: 'medium' }) })
						: t(`status.${status}`)}
				</p>
			</form>
			{listOpen && (
				<ProjectList projects={projects} current={name} onOpen={onOpen} onDelete={onDelete} />
			)}
		</section>
	)
}

/** The saved projects, most recent first: open one, or delete it (asked twice). */
export function ProjectList({
	projects,
	current,
	onOpen,
	onDelete
}: {
	projects: ProjectSummary[]
	current: string | null
	onOpen: (id: string) => void
	onDelete: (id: string) => void
}) {
	const t = useTranslations('Editor.projects')
	const format = useFormatter()
	const [deleting, setDeleting] = useState<string | null>(null)
	if (projects.length === 0) return <p className="text-text-muted text-xs">{t('none')}</p>
	return (
		<ul aria-label={t('myProjects')} className="flex flex-col gap-2">
			{projects.map((project) => (
				<li
					key={project.id}
					aria-label={project.name}
					className="border-border flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
				>
					<span className="text-text min-w-32 flex-1 truncate text-sm font-medium">
						{project.name}
						{project.name === current && (
							<span className="text-text-muted ml-2 text-xs">{t('current')}</span>
						)}
					</span>
					<span className="text-text-muted text-xs">
						{format.dateTime(project.savedAt, { dateStyle: 'medium', timeStyle: 'short' })}
					</span>
					{deleting === project.id ? (
						<>
							<span className="text-text text-xs">{t('deleteAsk')}</span>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => {
									setDeleting(null)
									onDelete(project.id)
								}}
							>
								{t('deleteYes')}
							</Button>
							<Button type="button" size="sm" variant="ghost" onClick={() => setDeleting(null)}>
								{t('deleteNo')}
							</Button>
						</>
					) : (
						<>
							<Button type="button" size="sm" variant="outline" onClick={() => onOpen(project.id)}>
								{t('open')}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() => setDeleting(project.id)}
							>
								{t('delete')}
							</Button>
						</>
					)}
				</li>
			))}
		</ul>
	)
}

/**
 * A project to open whose media the browser no longer holds (its storage was
 * cleared): pick each file again; it's taken only if its name and size
 * match. Opens once every piece is found.
 */
export function RelinkPanel({
	missing,
	onPick,
	onCancel
}: {
	missing: MediaRef[]
	onPick: (ref: MediaRef, file: File) => void
	onCancel: () => void
}) {
	const t = useTranslations('Editor.projects')
	const id = useId()
	return (
		<section
			aria-label={t('relinkLabel')}
			className="border-accent/40 bg-surface flex flex-col gap-3 rounded-lg border p-4"
		>
			<h2 className="text-text text-xs font-bold tracking-wider uppercase">{t('relinkLabel')}</h2>
			<p className="text-text-muted text-xs">{t('relinkHint')}</p>
			{missing.map((ref, index) => (
				<div key={ref.key} className="flex flex-wrap items-center gap-3">
					<Label htmlFor={`${id}-${index}`}>{t('find', { name: ref.name })}</Label>
					<input
						id={`${id}-${index}`}
						type="file"
						onChange={(event) => {
							const file = event.currentTarget.files?.[0]
							event.currentTarget.value = ''
							if (file) onPick(ref, file)
						}}
						className="text-text text-xs"
					/>
				</div>
			))}
			<div>
				<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
					{t('relinkCancel')}
				</Button>
			</div>
		</section>
	)
}
