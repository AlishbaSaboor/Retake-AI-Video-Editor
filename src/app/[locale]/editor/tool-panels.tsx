'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CloseIcon, SearchIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/** One tool panel: its name and other words to find it by, and the panel itself. */
export type Tool = {
	id: string
	/** Which tab it's in. */
	tab: string
	title: string
	/** More words someone might search for: what the panel does, in plain terms. */
	keywords: string
	panel: React.ReactNode
	/** A heading for a panel that has none of its own. */
	heading?: boolean
}

/** A tab of the tools column: its name and icon, and a line saying what's in it. */
export type ToolTab = { id: string; label: string; icon: React.ReactNode; description: string }

const words = (text: string) =>
	text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)

/** Whether every word typed starts a word of the tool's name or keywords. */
export function toolMatches(tool: Pick<Tool, 'title' | 'keywords'>, query: string): boolean {
	const have = words(`${tool.title} ${tool.keywords}`)
	return words(query).every((want) => have.some((word) => word.startsWith(want)))
}

/**
 * The editing tools, a tab each: a rail of icons and names, and the open
 * tab's heading, a line about it and its tools. The search looks across
 * every tab. Every panel stays mounted (hidden when not shown), so nothing
 * typed in one is lost by switching away.
 */
export function ToolPanels({ tabs, tools }: { tabs: ToolTab[]; tools: Tool[] }) {
	const t = useTranslations('Editor.tools')
	const [query, setQuery] = useState('')
	const [active, setActive] = useState(tabs[0]?.id ?? '')
	const searching = query.trim() !== ''
	const tab = tabs.find((each) => each.id === active) ?? tabs[0]
	const shown = tools.filter((tool) =>
		searching ? toolMatches(tool, query) : tool.tab === tab?.id
	)
	const tabOf = (tool: Tool) => tabs.find((each) => each.id === tool.tab)

	return (
		<section aria-label={t('label')} className="flex h-full min-h-0">
			<div
				role="tablist"
				aria-label={t('tabsLabel')}
				aria-orientation="vertical"
				className="border-border bg-surface flex w-[4.75rem] shrink-0 flex-col gap-1 overflow-y-auto border-r p-1.5"
			>
				{tabs.map((each) => {
					const selected = !searching && each.id === tab?.id
					return (
						<button
							key={each.id}
							type="button"
							role="tab"
							id={`tool-tab-${each.id}`}
							aria-selected={selected}
							aria-controls="tool-tab-panel"
							onClick={() => {
								setActive(each.id)
								setQuery('')
							}}
							className={cn(
								'focus-visible:outline-accent flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-center text-[11px] leading-tight font-medium transition-colors focus-visible:outline-2',
								selected
									? 'bg-accent-soft text-accent'
									: 'text-text-muted hover:bg-surface-hover hover:text-text'
							)}
						>
							{each.icon}
							{each.label}
						</button>
					)
				})}
			</div>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="border-border border-b p-3">
					<div className="border-border bg-surface-inset focus-within:border-accent focus-within:ring-accent-glow flex items-center gap-2 rounded-lg border px-2.5 transition-shadow focus-within:ring-2">
						<SearchIcon className="text-text-faint" />
						<input
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Escape') setQuery('')
							}}
							placeholder={t('searchPlaceholder')}
							aria-label={t('search')}
							data-tool-search
							className="text-text placeholder:text-text-faint h-9 w-full bg-transparent text-sm focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
						/>
						{query && (
							<button
								type="button"
								aria-label={t('clear')}
								onClick={() => setQuery('')}
								className="text-text-faint hover:text-text"
							>
								<CloseIcon />
							</button>
						)}
					</div>
				</div>
				<div
					id="tool-tab-panel"
					role={searching ? 'region' : 'tabpanel'}
					aria-label={searching ? t('results') : undefined}
					aria-labelledby={searching ? undefined : `tool-tab-${tab?.id}`}
					className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
				>
					{searching ? (
						<p role="status" className="text-text-muted text-xs">
							{shown.length ? t('found', { count: shown.length }) : t('none', { query })}
						</p>
					) : (
						tab && (
							<div className="flex flex-col gap-1 px-1 pb-1">
								<h2 className="font-display text-text text-lg font-semibold">{tab.label}</h2>
								<p className="text-text-muted text-sm leading-snug">{tab.description}</p>
							</div>
						)
					)}
					{tools.map((tool) => (
						<div key={tool.id} hidden={!shown.includes(tool)} data-tool={tool.id}>
							{searching && (
								<p className="text-text-faint mb-1.5 px-1 text-xs">
									{t('inTab', { tab: tabOf(tool)?.label ?? '' })}
								</p>
							)}
							{tool.heading ? (
								<div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
									<h3 className="text-text text-xs font-bold tracking-wider uppercase">
										{tool.title}
									</h3>
									{tool.panel}
								</div>
							) : (
								tool.panel
							)}
						</div>
					))}
				</div>
			</div>
		</section>
	)
}
