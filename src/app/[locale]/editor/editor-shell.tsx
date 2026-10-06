'use client'

import { useTranslations } from 'next-intl'
import { ArrowLeftIcon, PanelIcon } from '@/components/ui/icons'
import { ThemeToggle } from '@/components/theme-toggle'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'

/**
 * The editor's layout, the whole window: a top bar (back, the project's name
 * and whether it's saved, undo and redo, Before / After, hide panels,
 * export); under it the tool rail and its open panel on the left, the
 * picture and the timeline in the middle, and the assistant and the
 * transcript on the right. "Hide panels" folds both sides away to give the
 * video the room. Below `lg` they stack, the video first.
 */
export function EditorShell({
	title,
	centre,
	actions,
	rail,
	side,
	children,
	panelsShown,
	onPanelsShown
}: {
	/** The project's name and saved status; null before a video is in. */
	title: React.ReactNode
	/** Undo, redo and Before / After, in the middle of the top bar. */
	centre: React.ReactNode
	/** Export and the like, on the top bar's right. */
	actions: React.ReactNode
	/** The tool rail; null before a video is in. */
	rail: React.ReactNode
	/** The assistant and transcript column. */
	side: React.ReactNode
	/** The middle: the picture, its controls, the timeline. */
	children: React.ReactNode
	panelsShown: boolean
	onPanelsShown: (shown: boolean) => void
}) {
	const t = useTranslations('Editor.layout')
	const hasRail = rail !== null
	const toggleLabel = panelsShown ? t('hidePanels') : t('showPanels')
	return (
		<div className="flex min-h-dvh flex-col lg:h-dvh">
			<header
				role="toolbar"
				aria-label={t('toolbar')}
				className="border-border bg-surface flex min-h-14 flex-wrap items-center gap-2 border-b px-2 py-2 sm:px-3"
			>
				<Link
					href="/home"
					aria-label={t('back')}
					title={t('back')}
					className="text-text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-accent inline-flex size-9 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2"
				>
					<ArrowLeftIcon size={18} />
				</Link>
				<span
					aria-hidden
					className="bg-accent shadow-accent-glow mr-1 size-2.5 shrink-0 rounded-full shadow-[0_0_12px]"
				/>
				<div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">{title}</div>
				<div className="flex items-center gap-1.5 lg:mx-auto">{centre}</div>
				<div className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0">
					<ThemeToggle />
					{hasRail && (
						<button
							type="button"
							aria-pressed={!panelsShown}
							onClick={() => onPanelsShown(!panelsShown)}
							className="border-border text-text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-accent inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2"
						>
							<PanelIcon size={16} />
							<span className="max-sm:sr-only">{toggleLabel}</span>
						</button>
					)}
					{actions}
				</div>
			</header>
			<div
				className={cn(
					'flex min-h-0 flex-1 flex-col lg:grid lg:grid-rows-[minmax(0,1fr)]',
					hasRail && panelsShown
						? 'lg:grid-cols-[auto_minmax(0,1fr)_24rem]'
						: 'lg:grid-cols-[minmax(0,1fr)_24rem]',
					!panelsShown && 'lg:grid-cols-[minmax(0,1fr)]'
				)}
			>
				{/* Hidden, not removed: a half-typed field or command stays. */}
				{hasRail && (
					<aside
						hidden={!panelsShown}
						className="order-2 min-h-0 lg:order-none lg:h-full lg:overflow-hidden"
					>
						{rail}
					</aside>
				)}
				<div className="relative order-1 flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-3 lg:order-none lg:p-4">
					{!panelsShown && hasRail && (
						<button
							type="button"
							onClick={() => onPanelsShown(true)}
							className="border-border bg-surface text-text hover:bg-surface-hover focus-visible:outline-accent inline-flex h-9 items-center gap-2 self-start rounded-lg border px-3 text-sm font-medium focus-visible:outline-2"
						>
							<PanelIcon size={16} />
							{t('showToolsAndChat')}
						</button>
					)}
					{children}
				</div>
				<aside
					hidden={!panelsShown}
					className="border-border bg-surface order-3 flex min-h-0 flex-col border-t lg:order-none lg:border-t-0 lg:border-l"
				>
					{side}
				</aside>
			</div>
		</div>
	)
}
