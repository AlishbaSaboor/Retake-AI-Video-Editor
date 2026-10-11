'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { DownloadIcon, EditIcon, TrashIcon } from '@/components/ui/icons'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { toast } from '@/lib/toast'
import {
	deleteProject,
	projectVideo,
	renameProject,
	type ProjectSummary
} from '@/app/[locale]/editor/projects/projects'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { ProjectThumbnail } from './project-thumbnail'

const action =
	'text-text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-accent inline-flex size-9 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-2'

/**
 * A saved project: its picture, name and last edit, opening in the editor;
 * and below, rename it in place, download its video, or delete it (asked
 * first: it can't be undone).
 */
export function ProjectCard({ project }: { project: ProjectSummary }) {
	const t = useTranslations('Site.projects')
	const format = useFormatter()
	const queryClient = useQueryClient()
	const dialogRef = useRef<HTMLDialogElement>(null)
	const [renaming, setRenaming] = useState(false)
	const [typed, setTyped] = useState(project.name)
	const refresh = () => queryClient.invalidateQueries({ queryKey: ['projects'] })

	async function rename() {
		setRenaming(false)
		const name = typed.trim()
		if (!name || name === project.name) return setTyped(project.name)
		await renameProject(project.id, name)
		await refresh()
	}

	async function download() {
		const file = await projectVideo(project.id).catch(() => null)
		if (!file) {
			toast({ variant: 'destructive', title: t('downloadFailed', { name: project.name }) })
			return
		}
		const url = URL.createObjectURL(file)
		const link = Object.assign(document.createElement('a'), { href: url, download: file.name })
		link.click()
		// After the click has started the download.
		setTimeout(() => URL.revokeObjectURL(url), 0)
	}

	async function remove() {
		dialogRef.current?.close()
		await deleteProject(project.id).catch((error: unknown) => {
			const { userMessage } = captureClientError(error, { feature: 'delete_project' })
			toast({ variant: 'destructive', title: t('deleteFailed'), description: userMessage })
		})
		await refresh()
	}

	const when = format.dateTime(project.savedAt, { dateStyle: 'medium', timeStyle: 'short' })
	return (
		<article
			aria-label={project.name}
			className={cn(
				'group rt-lift bg-surface flex flex-col overflow-hidden rounded-[22px] border transition-colors',
				renaming ? 'border-accent/60' : 'border-border hover:border-border-strong'
			)}
		>
			<Link
				href={{ pathname: '/editor', query: { project: project.id } }}
				aria-label={t('open', { name: project.name })}
				className="focus-visible:outline-accent block focus-visible:outline-2 focus-visible:-outline-offset-2"
			>
				<ProjectThumbnail id={project.id} savedAt={project.savedAt} />
			</Link>
			<div className="flex items-center gap-2 px-[18px] py-4">
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					{renaming ? (
						<form
							onSubmit={(event) => {
								event.preventDefault()
								void rename()
							}}
						>
							<input
								autoFocus
								value={typed}
								onChange={(event) => setTyped(event.target.value)}
								onBlur={() => void rename()}
								onKeyDown={(event) => {
									if (event.key !== 'Escape') return
									setTyped(project.name)
									setRenaming(false)
								}}
								aria-label={t('nameLabel')}
								className="border-accent/60 bg-surface-inset text-text ring-accent-soft w-full rounded-xl border px-3 py-2 text-[15px] font-extrabold ring-4 focus-visible:outline-none"
							/>
						</form>
					) : (
						<Link
							href={{ pathname: '/editor', query: { project: project.id } }}
							className="text-text hover:text-accent-fg focus-visible:outline-accent truncate rounded text-base font-extrabold focus-visible:outline-2"
						>
							{project.name}
						</Link>
					)}
					<span className="text-text-faint text-[13px]">
						{renaming ? t('renameHint') : t('edited', { when })}
					</span>
				</div>
				<div className="flex shrink-0 gap-0.5">
					<button
						type="button"
						className={action}
						aria-label={t('rename', { name: project.name })}
						title={t('renameShort')}
						onClick={() => setRenaming(true)}
					>
						<EditIcon />
					</button>
					<button
						type="button"
						className={action}
						aria-label={t('download', { name: project.name })}
						title={t('downloadShort')}
						onClick={() => void download()}
					>
						<DownloadIcon />
					</button>
					<button
						type="button"
						className={`${action} hover:text-danger`}
						aria-label={t('delete', { name: project.name })}
						title={t('deleteShort')}
						onClick={() => dialogRef.current?.showModal()}
					>
						<TrashIcon />
					</button>
				</div>
			</div>
			<dialog
				ref={dialogRef}
				aria-labelledby={`delete-${project.id}`}
				className="border-border bg-surface-raised text-text m-auto w-[min(26rem,calc(100vw-2rem))] rounded-3xl border p-0 shadow-(--shadow-card) backdrop:bg-black/60 backdrop:backdrop-blur-sm"
			>
				<div className="flex flex-col gap-3 p-6">
					<h2 id={`delete-${project.id}`} className="text-xl font-extrabold">
						{t('deleteTitle', { name: project.name })}
					</h2>
					<p className="text-text-muted text-sm">{t('deleteBody')}</p>
					<div className="mt-2 flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							autoFocus
							onClick={() => dialogRef.current?.close()}
						>
							{t('keep')}
						</Button>
						<Button type="button" variant="destructive" onClick={() => void remove()}>
							<TrashIcon />
							{t('deleteYes')}
						</Button>
					</div>
				</div>
			</dialog>
		</article>
	)
}
