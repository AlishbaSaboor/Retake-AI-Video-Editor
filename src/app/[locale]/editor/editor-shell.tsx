'use client'

import { useTranslations } from 'next-intl'
import { ArrowLeftIcon, PanelIcon } from '@/components/ui/icons'
import { ThemeToggle } from '@/components/theme-toggle'
import { LogoMark } from '@/components/site/logo'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'

/**
 * The editor's layout, the whole window: a top bar (back, the project's name
 * and whether it's saved, undo and redo, Before / After, export); under it
 * the tool panel on the left (the tools, the assistant and the transcript)
 * and the picture and the timeline. One small icon on the left edge hides
 * and shows the panel. Below `lg` they stack, the video first.
 */
export function EditorShell({
	title,
	centre,
	actions,
	rail,
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
	/** The tool panel; null before a video is in. */
	rail: React.ReactNode
	/** The middle: the picture, its controls, the timeline. */
	children: React.ReactNode
	panelsShown: boolean
	onPanelsShown: (shown: boolean) => void
}) {
	const t = useTranslations('Editor.layout')
	const hasRail = rail !== null
	const shown = hasRail && panelsShown
	const toggleLabel = panelsShown ? t('hidePanel') : t('showPanel')
	return (
		<div className="flex min-h-dvh flex-col lg:h-dvh">
			<header
				role="toolbar"
				aria-label={t('toolbar')}
				className="border-border bg-bg flex min-h-[60px] flex-wrap items-center gap-2 border-b px-2 py-2 sm:px-4"
			>
				<Link
					href="/home"
					aria-label={t('back')}
					title={t('back')}
					className="text-text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-accent inline-flex size-9 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2"
				>
					<ArrowLeftIcon size={18} />
				</Link>
				<LogoMark className="mr-1" />
				<div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">{title}</div>
				<div className="flex items-center gap-1.5 lg:mx-auto">{centre}</div>
				<div className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0">
					<ThemeToggle />
					{actions}
				</div>
			</header>
			<div
				className={cn(
					'flex min-h-0 flex-1 flex-col lg:grid lg:grid-rows-[minmax(0,1fr)]',
					shown ? 'lg:grid-cols-[auto_auto_minmax(0,1fr)]' : 'lg:grid-cols-[auto_minmax(0,1fr)]'
				)}
			>
				{hasRail && (
					<div className="border-border flex shrink-0 border-b px-1 py-1 lg:flex-col lg:border-r lg:border-b-0 lg:py-2">
						<button
							type="button"
							aria-label={toggleLabel}
							title={toggleLabel}
							aria-expanded={panelsShown}
							aria-controls="tool-rail"
							onClick={() => onPanelsShown(!panelsShown)}
							className="text-text-faint hover:bg-surface-hover hover:text-text focus-visible:outline-accent inline-flex size-7 items-center justify-center rounded-md focus-visible:outline-2"
						>
							<PanelIcon size={15} />
						</button>
					</div>
				)}
				{/* Hidden, not removed: a half-typed field or command stays. */}
				{hasRail && (
					<aside
						id="tool-rail"
						hidden={!panelsShown}
						className="order-2 min-h-0 lg:order-none lg:h-full lg:overflow-hidden"
					>
						{rail}
					</aside>
				)}
				<div className="relative order-1 flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4 lg:order-none lg:p-6">
					{children}
				</div>
			</div>
		</div>
	)
}
