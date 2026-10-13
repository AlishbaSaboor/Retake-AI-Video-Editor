'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { CheckIcon, ManualIcon, SparkleIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { MadeWith } from '../../projects/editor-start'
import { formatTimecode } from '../../model/timeline-scale'

// The editor as Make it opens it: the edited video with only the chat beside
// it (the "AI studio"), and a way into the full editor on the same project.
// These pieces only show things; the editor decides which view is on.

/** The top bar's switch between the chat-only view and the full editor. */
export function ModeSwitch({
	studio,
	onChange
}: {
	studio: boolean
	onChange: (studio: boolean) => void
}) {
	const t = useTranslations('Editor.studio')
	const options = [
		{ key: 'ai', on: true, icon: <SparkleIcon size={15} /> },
		{ key: 'manual', on: false, icon: <ManualIcon size={15} /> }
	] as const
	return (
		<div
			role="group"
			aria-label={t('modes')}
			className="border-border bg-surface flex gap-0.5 rounded border p-[3px]"
		>
			{options.map(({ key, on, icon }) => {
				const active = studio === on
				return (
					<button
						key={key}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(on)}
						className={cn(
							'focus-visible:outline-accent inline-flex h-[34px] items-center gap-[7px] rounded-[9px] px-[13px] text-sm whitespace-nowrap transition-colors focus-visible:outline-2',
							active
								? 'bg-accent text-accent-ink font-semibold'
								: 'text-text-muted hover:text-text font-medium'
						)}
					>
						{icon}
						{t(key)}
					</button>
				)
			})}
		</div>
	)
}

/** Over the chat: what was asked on the Make it page, and what was applied. */
export function MadeWithIntro({ made }: { made: MadeWith }) {
	const t = useTranslations('Editor.studio')
	return (
		<div className="flex flex-col">
			<div className="border-border flex flex-col border-b px-5 py-4">
				<span className="font-display text-text text-lg font-semibold tracking-[-0.02em]">
					{t('title')}
				</span>
				<span className="text-text-faint text-[13px]">{t('help')}</span>
			</div>
			<div className="flex flex-col gap-3.5 px-5 pt-[18px]">
				<p className="bg-accent text-accent-ink ml-auto max-w-[85%] rounded-[14px_14px_4px_14px] px-3.5 py-2.5 font-medium">
					{made.request}
				</p>
				<section aria-label={t('applied')} className="flex max-w-[94%] flex-col gap-2">
					<p className="text-success flex items-center gap-1.5 font-semibold">
						<CheckIcon size={15} />
						{t('appliedLength', { length: formatTimecode(Math.round(made.editedSeconds)) })}
					</p>
					<ul className="text-text-muted flex list-disc flex-col gap-[3px] pl-[18px] text-[14.5px]">
						{made.lines.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
					<p className="text-text-faint text-[13px]">{t('undoHint')}</p>
				</section>
			</div>
		</div>
	)
}

/** Under the video in the chat-only view: how long the edit is, and the way into the full editor. */
export function StudioCards({
	made,
	editedSeconds,
	onManual
}: {
	made: MadeWith
	editedSeconds: number
	onManual: () => void
}) {
	const t = useTranslations('Editor.studio')
	return (
		<div className="grid w-full gap-3 sm:grid-cols-2 xl:col-start-2! xl:row-span-2 xl:row-start-1 xl:grid-cols-1 xl:self-end">
			<div className="border-border bg-surface flex flex-col gap-1.5 rounded-[18px] border p-4">
				<span className="text-text-faint font-mono text-[11px] tracking-[0.12em] uppercase">
					{t('yourEdit')}
				</span>
				<span className="text-text font-display text-[40px] leading-none tracking-[-0.04em] tabular-nums">
					{formatTimecode(Math.round(editedSeconds))}
				</span>
				<span className="text-text-muted text-[13px]">
					{t('from', { length: formatTimecode(Math.round(made.originalSeconds)) })}
				</span>
			</div>
			<div className="border-border bg-surface flex flex-col gap-2 rounded-[18px] border p-4">
				<span className="text-text text-[15px] font-semibold">{t('finer')}</span>
				<span className="text-text-muted text-[13px] leading-snug">{t('finerBody')}</span>
				<Button type="button" variant="outline" className="mt-1 self-start" onClick={onManual}>
					<ManualIcon />
					{t('manual')}
				</Button>
			</div>
		</div>
	)
}
