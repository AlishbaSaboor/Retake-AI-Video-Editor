'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { VideoIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/** The project's videos: the main one, and any added after it; add another, or replace the main one. */
export function VideosPanel({
	main,
	added,
	canEdit,
	onAdd,
	replace,
	input
}: {
	main: string
	added: string[]
	canEdit: boolean
	onAdd: () => void
	/** The main video's file picker, inside the Replace label. */
	replace: React.ReactNode
	input: React.ReactNode
}) {
	const t = useTranslations('Editor.videos')
	return (
		<section aria-label={t('label')} className="flex flex-col gap-4">
			<Button type="button" disabled={!canEdit} onClick={onAdd} className="self-start">
				<VideoIcon />
				{t('add')}
			</Button>
			{input}
			<ul className="flex flex-col gap-1.5">
				{[main, ...added].map((name, index) => (
					<li
						key={`${index}-${name}`}
						className="border-border bg-surface flex items-center gap-3 rounded-lg border px-3 py-2.5"
					>
						<VideoIcon className="text-text-faint shrink-0" />
						<span className="text-text min-w-0 flex-1 truncate text-sm">{name}</span>
						<span className="text-text-faint text-xs">{index === 0 ? t('main') : t('added')}</span>
					</li>
				))}
			</ul>
			<label
				className={cn(
					'border-border text-text hover:bg-surface-hover has-[:focus-visible]:outline-accent inline-flex h-9 cursor-pointer items-center gap-2 self-start rounded-md border px-3 text-sm font-medium has-[:focus-visible]:outline-2',
					!canEdit && 'pointer-events-none opacity-40'
				)}
			>
				{t('replace')}
				{replace}
			</label>
			<p className="text-text-muted text-xs">{t('help')}</p>
		</section>
	)
}
