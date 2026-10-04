'use client'

import { useTranslations } from 'next-intl'
import { PanelIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * The editor's layout: the chat on the left, the picture and timeline in the
 * middle under a toolbar, the tools on the right. Either side can be hidden
 * to give the video more room. Below `lg` the three stack instead.
 */
export function EditorShell({
	chat,
	toolbar,
	status,
	tools,
	children,
	chatOpen,
	toolsOpen,
	onChatOpen,
	onToolsOpen
}: {
	chat: React.ReactNode
	/** The video's name and its actions; null before a video is in. */
	toolbar: React.ReactNode
	/** Saved, running jobs, undo/redo, shortcuts: on the toolbar's right. */
	status: React.ReactNode
	tools: React.ReactNode
	/** The centre: the picture, its controls, the timeline. */
	children: React.ReactNode
	chatOpen: boolean
	toolsOpen: boolean
	onChatOpen: (open: boolean) => void
	onToolsOpen: (open: boolean) => void
}) {
	const t = useTranslations('Editor.layout')
	const hasTools = tools !== null
	const toolsShown = hasTools && toolsOpen
	const toggle =
		'text-text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-accent inline-flex size-9 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 aria-pressed:text-accent'
	return (
		<div
			className={cn(
				'grid flex-1 grid-cols-1 lg:h-[calc(100dvh-3.5rem)] lg:flex-none lg:grid-rows-[minmax(0,1fr)]',
				chatOpen && toolsShown && 'lg:grid-cols-[20rem_minmax(0,1fr)_22rem]',
				chatOpen && !toolsShown && 'lg:grid-cols-[20rem_minmax(0,1fr)]',
				!chatOpen && toolsShown && 'lg:grid-cols-[minmax(0,1fr)_22rem]'
			)}
		>
			{/* Hidden, not removed: the chat's history and a half-typed command stay. */}
			<aside
				hidden={!chatOpen}
				className="border-border bg-surface order-2 min-h-0 border-t lg:order-none lg:border-t-0 lg:border-r"
			>
				{chat}
			</aside>
			<div className="order-1 flex min-h-0 min-w-0 flex-col lg:order-none">
				<div
					role="toolbar"
					aria-label={t('toolbar')}
					className="border-border bg-surface flex min-h-14 flex-wrap items-center gap-2 border-b px-3 py-2"
				>
					<button
						type="button"
						aria-label={chatOpen ? t('hideChat') : t('showChat')}
						title={`${chatOpen ? t('hideChat') : t('showChat')} ([)`}
						aria-pressed={chatOpen}
						onClick={() => onChatOpen(!chatOpen)}
						className={toggle}
					>
						<PanelIcon size={18} />
					</button>
					{toolbar}
					<div className="ml-auto flex flex-wrap items-center gap-2">
						{status}
						{hasTools && (
							<button
								type="button"
								aria-label={toolsOpen ? t('hideTools') : t('showTools')}
								title={`${toolsOpen ? t('hideTools') : t('showTools')} (])`}
								aria-pressed={toolsOpen}
								onClick={() => onToolsOpen(!toolsOpen)}
								className={cn(toggle, '-scale-x-100')}
							>
								<PanelIcon size={18} />
							</button>
						)}
					</div>
				</div>
				<div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
					{children}
				</div>
			</div>
			{hasTools && (
				<aside
					hidden={!toolsOpen}
					className="border-border bg-bg order-3 min-h-0 border-t lg:order-none lg:border-t-0 lg:border-l"
				>
					{tools}
				</aside>
			)}
		</div>
	)
}
