'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { CheckIcon, ManualIcon, SparkleIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { MadeWith } from './editor-start'
import { formatTimecode } from './timeline-scale'

// The editor as Make it opens it: the edited video with only the chat beside
// it (the "AI studio"), and a way into the full editor on the same project.
// These pieces only show things; the editor decides which view is on.

const DOTS = ['bg-brand-violet', 'bg-brand-purple', 'bg-brand-blue', 'bg-brand-lilac'] as const

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
			className="border-border bg-glass flex gap-0.5 rounded-[12px] border p-[3px]"
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
							'focus-visible:outline-accent inline-flex h-[34px] items-center gap-1.5 rounded-[9px] px-3.5 text-[13.5px] transition-colors focus-visible:outline-2',
							active
								? 'bg-brand font-extrabold text-white'
								: 'text-text-muted hover:text-text font-bold'
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
		<div className="flex flex-col gap-3 px-5 pt-5">
			<div className="flex items-center gap-3">
				<span className="bg-brand flex size-9 shrink-0 items-center justify-center rounded-[11px] text-white">
					<SparkleIcon size={17} />
				</span>
				<span className="flex flex-col">
					<span className="text-text text-base font-extrabold">{t('title')}</span>
					<span className="text-text-muted text-xs">{t('help')}</span>
				</span>
			</div>
			<p className="bg-brand ml-auto max-w-[85%] rounded-[16px_16px_4px_16px] px-3.5 py-2.5 text-sm font-semibold text-white">
				{made.request}
			</p>
			<section
				aria-label={t('applied')}
				className="border-border bg-surface-inset flex flex-col gap-2 rounded-[16px_16px_16px_4px] border p-3.5"
			>
				<p className="text-success flex items-center gap-1.5 text-[13.5px] font-extrabold">
					<CheckIcon size={14} />
					{t('appliedLength', { length: formatTimecode(Math.round(made.editedSeconds)) })}
				</p>
				<ul className="flex flex-col gap-1">
					{made.lines.map((line, index) => (
						<li key={line} className="text-text flex items-start gap-2 text-[13px] leading-snug">
							<span
								aria-hidden
								className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', DOTS[index % DOTS.length])}
							/>
							{line}
						</li>
					))}
				</ul>
				<p className="text-text-faint text-xs">{t('undoHint')}</p>
			</section>
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
				<span className="text-text-faint text-[11px] font-extrabold tracking-[0.12em] uppercase">
					{t('yourEdit')}
				</span>
				<span className="text-text font-mono text-[28px] leading-none font-semibold">
					{formatTimecode(Math.round(editedSeconds))}
				</span>
				<span className="text-text-muted text-[13px]">
					{t('from', { length: formatTimecode(Math.round(made.originalSeconds)) })}
				</span>
			</div>
			<div className="border-accent/40 bg-accent-soft flex flex-col gap-2 rounded-[18px] border p-4">
				<span className="text-text text-[15px] font-extrabold">{t('finer')}</span>
				<span className="text-text-muted text-[13px] leading-snug">{t('finerBody')}</span>
				<Button type="button" variant="contrast" className="mt-1 self-start" onClick={onManual}>
					<ManualIcon />
					{t('manual')}
				</Button>
			</div>
		</div>
	)
}
