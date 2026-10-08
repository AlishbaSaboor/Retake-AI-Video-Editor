'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { AlertIcon, CheckIcon, SpinnerIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { SaveStatus } from './project-panel'

/**
 * Whether the edit is saved, at a glance: saved (and when), saving, not
 * saved yet, or a failed save. A project autosaves after each change once
 * it has been saved once.
 */
export function SaveBadge({ status, savedAt }: { status: SaveStatus; savedAt: number | null }) {
	const t = useTranslations('Editor.status')
	const format = useFormatter()
	const when = savedAt ? format.dateTime(savedAt, { timeStyle: 'short' }) : ''
	return (
		<span
			data-testid="save-badge"
			title={status === 'saved' ? t('savedAt', { when }) : undefined}
			className={cn(
				'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium',
				status === 'saved' && 'border-success/40 text-success',
				status === 'saving' && 'border-border text-text-muted',
				status === 'unsaved' && 'border-border text-text-faint',
				status === 'failed' && 'border-danger/50 text-danger'
			)}
		>
			{status === 'saved' && <CheckIcon size={14} />}
			{status === 'saving' && <SpinnerIcon size={14} />}
			{status === 'failed' && <AlertIcon size={14} />}
			{t(status)}
		</span>
	)
}

export type Job = { id: string; label: string }

/** Long jobs running now (loading the video, its transcript), each with a spinner. */
export function JobProgress({ jobs }: { jobs: Job[] }) {
	if (jobs.length === 0) return null
	return (
		<div className="flex flex-wrap items-center gap-2">
			{jobs.map((job) => (
				<span
					key={job.id}
					data-job={job.id}
					className="bg-accent-soft text-accent-fg inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
				>
					<SpinnerIcon size={14} />
					{job.label}
				</span>
			))}
		</div>
	)
}
