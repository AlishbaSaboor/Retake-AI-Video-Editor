'use client'

import { useTranslations } from 'next-intl'
import { ArrowLeftIcon, PanelIcon } from '@/components/ui/icons'
import { ThemeToggle } from '@/components/theme-toggle'
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
	onPanelsShown,
	railRight = false,
	mainClassName
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
	/** The panel on the right of the picture, always shown (the chat-only view after Make it). */
	railRight?: boolean
	/** More classes for the middle (the picture and its controls). */
	mainClassName?: string
}) {
	const t = useTranslations('Editor.layout')
	const hasRail = rail !== null
	const shown = hasRail && (panelsShown || railRight)
	const toggleLabel = panelsShown ? t('hidePanel') : t('showPanel')
	return (
		<div className="flex min-h-dvh flex-col lg:h-dvh">
			<header
				role="toolbar"
				aria-label={t('toolbar')}
				className="border-border sticky top-0 z-10 flex min-h-[62px] flex-wrap items-center gap-2.5 border-b bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-[clamp(12px,2.4vw,24px)] py-2 backdrop-blur-[12px]"
			>
				<Link
					href="/home"
					aria-label={t('back')}
					title={t('back')}
					className="text-text-muted hover:bg-border hover:text-text focus-visible:outline-accent inline-flex size-[38px] shrink-0 items-center justify-center rounded-[10px] focus-visible:outline-2"
				>
					<ArrowLeftIcon size={18} />
				</Link>
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
					railRight
						? 'lg:grid-cols-[minmax(0,1fr)_auto]'
						: shown
							? 'lg:grid-cols-[auto_auto_minmax(0,1fr)]'
							: 'lg:grid-cols-[auto_minmax(0,1fr)]'
				)}
			>
				{hasRail && !railRight && (
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
						hidden={!shown}
						className={cn(
							'order-2 min-h-0 lg:h-full lg:overflow-hidden',
							// The chat-only view on a phone: a panel of its own height, its
							// messages scrolling, the box to type in always at its foot.
							railRight ? 'border-border max-lg:h-[80dvh] lg:order-2 lg:border-l' : 'lg:order-none'
						)}
					>
						{rail}
					</aside>
				)}
				<div
					className={cn(
						'relative order-1 flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4 lg:p-6',
						railRight ? 'lg:order-1' : 'lg:order-none',
						mainClassName
					)}
				>
					{children}
				</div>
			</div>
		</div>
	)
}
