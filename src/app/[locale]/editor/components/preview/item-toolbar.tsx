'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CloseIcon, ReplaceIcon, TimingIcon, TrashIcon } from '@/components/ui/icons'

const SECONDS_STEP = 0.1

/** When an item shows, in the edited video. */
export type Timing = { startSeconds: number; endSeconds: number }

/**
 * A small bar for the item picked on the video, above it (never over what's
 * being moved): replace it (a logo's file,
 * or a title's or text's words), change when it shows, or delete it. Timing
 * opens two fields under it; each change is one undo step.
 */
export function ItemToolbar({
	name,
	timing,
	editedSeconds,
	onReplace,
	onTiming,
	onDelete,
	onClose
}: {
	/** What's picked, said in the bar's label: "Title", "Logo", "Box 2". */
	name: string
	/** When it shows; null for something on the whole video (the logo). */
	timing: Timing | null
	editedSeconds: number
	onReplace?: () => void
	onTiming: (timing: Timing) => void
	onDelete: () => void
	onClose: () => void
}) {
	const t = useTranslations('Editor.item')
	const id = useId()
	const [open, setOpen] = useState(false)
	const [draft, setDraft] = useState<Timing | null>(null)
	const shown = draft ?? timing
	const valid =
		shown !== null &&
		shown.startSeconds >= 0 &&
		shown.endSeconds > shown.startSeconds &&
		shown.startSeconds < editedSeconds

	return (
		<div
			role="toolbar"
			aria-label={t('label', { name })}
			className="border-border bg-surface relative flex flex-col gap-2 rounded-lg border p-1 shadow-md"
			onPointerDown={(event) => event.stopPropagation()}
		>
			<div className="flex items-center gap-0.5">
				<span className="text-text-muted px-2 text-xs font-medium">{name}</span>
				{onReplace && (
					<Button type="button" size="sm" variant="ghost" onClick={onReplace}>
						<ReplaceIcon />
						{t('replace')}
					</Button>
				)}
				{timing && (
					<Button
						type="button"
						size="sm"
						variant={open ? 'secondary' : 'ghost'}
						aria-expanded={open}
						onClick={() => {
							setOpen(!open)
							setDraft(null)
						}}
					>
						<TimingIcon />
						{t('timing')}
					</Button>
				)}
				<Button
					type="button"
					size="icon"
					variant="ghost"
					aria-label={t('delete', { name })}
					title={t('delete', { name })}
					onClick={onDelete}
				>
					<TrashIcon />
				</Button>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					aria-label={t('deselect')}
					title={t('deselect')}
					onClick={onClose}
				>
					<CloseIcon />
				</Button>
			</div>
			{open && shown && (
				<form
					className="border-border bg-surface absolute top-full right-0 z-30 mt-1 flex items-end gap-2 rounded-lg border p-2 shadow-xl"
					onSubmit={(event) => {
						event.preventDefault()
						if (!valid) return
						onTiming({
							startSeconds: shown.startSeconds,
							endSeconds: Math.min(shown.endSeconds, editedSeconds)
						})
						setOpen(false)
						setDraft(null)
					}}
				>
					<div className="flex w-24 flex-col gap-1">
						<Label htmlFor={`${id}-start`}>{t('from')}</Label>
						<Input
							id={`${id}-start`}
							type="number"
							min={0}
							step={SECONDS_STEP}
							value={Number(shown.startSeconds.toFixed(2))}
							onChange={(event) => setDraft({ ...shown, startSeconds: Number(event.target.value) })}
						/>
					</div>
					<div className="flex w-24 flex-col gap-1">
						<Label htmlFor={`${id}-end`}>{t('to')}</Label>
						<Input
							id={`${id}-end`}
							type="number"
							min={0}
							step={SECONDS_STEP}
							value={Number(shown.endSeconds.toFixed(2))}
							onChange={(event) => setDraft({ ...shown, endSeconds: Number(event.target.value) })}
						/>
					</div>
					<Button type="submit" size="sm" disabled={!valid}>
						{t('set')}
					</Button>
				</form>
			)}
		</div>
	)
}
