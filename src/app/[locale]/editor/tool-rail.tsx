'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CloseIcon, SearchIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/** The rail's groups, top to bottom: the project, then fixing what's there, adding to it, adjusting how it looks. */
export const TOOL_GROUPS = ['project', 'fix', 'add', 'adjust'] as const
export type ToolGroup = (typeof TOOL_GROUPS)[number]

/** One tool: its place on the rail, its name and help line, other words to find it by, its panel. */
export type Tool = {
	id: string
	group: ToolGroup
	label: string
	icon: React.ReactNode
	/** One line under the panel's heading: what it's for. */
	help: string
	/** More words someone might search for: what the tool does, in plain terms. */
	keywords: string
	panel: React.ReactNode
}

const words = (text: string) =>
	text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)

/** Whether every word typed starts a word of the tool's name, help or keywords. */
export function toolMatches(tool: Pick<Tool, 'label' | 'help' | 'keywords'>, query: string) {
	const have = words(`${tool.label} ${tool.help} ${tool.keywords}`)
	return words(query).every((want) => have.some((word) => word.startsWith(want)))
}

/**
 * The tools: a narrow rail of icons and names in groups, and beside it the
 * open tool's panel, with its heading, a line about it and a search across
 * every tool. Clicking the open tool again folds the panel away. Every panel
 * stays mounted (hidden when not shown), so nothing typed in one is lost by
 * switching away.
 */
export function ToolRail({
	tools,
	open,
	onOpen,
	disabledNote = null
}: {
	tools: Tool[]
	/** The open tool's id; null when the panel is folded away. */
	open: string | null
	onOpen: (id: string | null) => void
	/** Why nothing in the panels can be changed right now (the Original view); null when it can. */
	disabledNote?: string | null
}) {
	const t = useTranslations('Editor.tools')
	const [query, setQuery] = useState('')
	const searching = query.trim() !== ''
	const tool = tools.find((each) => each.id === open) ?? null
	const found = searching ? tools.filter((each) => toolMatches(each, query)) : []

	function choose(id: string) {
		setQuery('')
		onOpen(id)
	}

	return (
		<section aria-label={t('label')} className="flex h-full min-h-0">
			<div
				role="tablist"
				aria-label={t('tabsLabel')}
				aria-orientation="vertical"
				className="border-border bg-surface flex min-h-0 w-[4.5rem] shrink-0 flex-col gap-0.5 overflow-y-auto border-r px-1 py-1.5"
			>
				{TOOL_GROUPS.map((group) => {
					const inGroup = tools.filter((each) => each.group === group)
					if (inGroup.length === 0) return null
					return (
						<div
							key={group}
							role="presentation"
							className={cn(
								'flex flex-col gap-0.5',
								group === 'project' && 'border-border border-b pb-1.5'
							)}
						>
							{group !== 'project' && (
								<p
									role="presentation"
									className="text-text-faint pt-1 pb-0.5 text-center font-mono text-[9px] tracking-widest uppercase"
								>
									{t(`groups.${group}`)}
								</p>
							)}
							{inGroup.map((each) => {
								const selected = each.id === open
								return (
									<button
										key={each.id}
										type="button"
										role="tab"
										id={`tool-tab-${each.id}`}
										aria-selected={selected}
										aria-controls="tool-panel"
										title={each.help}
										onClick={() => {
											setQuery('')
											onOpen(selected ? null : each.id)
										}}
										className={cn(
											'focus-visible:outline-accent flex flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 text-center text-[10.5px] leading-tight font-medium transition-colors focus-visible:outline-2',
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
					)
				})}
			</div>
			<div
				id="tool-panel"
				hidden={tool === null}
				role="tabpanel"
				aria-labelledby={tool ? `tool-tab-${tool.id}` : undefined}
				className="border-border bg-bg flex min-h-0 w-[min(22rem,calc(100vw-5rem))] shrink-0 flex-col border-r"
			>
				<div className="border-border flex flex-col gap-3 border-b p-4">
					<div className="flex items-start gap-2">
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<h2 className="font-display text-text text-lg font-semibold">{tool?.label}</h2>
							<p className="text-text-muted text-sm leading-snug">{tool?.help}</p>
						</div>
						<button
							type="button"
							aria-label={t('close')}
							onClick={() => onOpen(null)}
							className="text-text-faint hover:text-text hover:bg-surface-hover focus-visible:outline-accent rounded-md p-1 focus-visible:outline-2"
						>
							<CloseIcon />
						</button>
					</div>
					<div className="border-border bg-surface-inset focus-within:border-accent focus-within:ring-accent-glow flex items-center gap-2 rounded-lg border px-2.5 transition-shadow focus-within:ring-2">
						<SearchIcon className="text-text-faint" />
						<input
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Escape') setQuery('')
								if (event.key === 'Enter' && found[0]) choose(found[0].id)
							}}
							placeholder={t('searchPlaceholder')}
							aria-label={t('search')}
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
				{searching && (
					<div role="region" aria-label={t('results')} className="flex flex-col gap-2 p-4">
						<p role="status" className="text-text-muted text-xs">
							{found.length ? t('found', { count: found.length }) : t('none', { query })}
						</p>
						{found.map((each) => (
							<button
								key={each.id}
								type="button"
								onClick={() => choose(each.id)}
								className="border-border bg-surface hover:border-border-strong hover:bg-surface-hover focus-visible:outline-accent flex items-center gap-3 rounded-lg border p-3 text-left focus-visible:outline-2"
							>
								<span className="text-accent">{each.icon}</span>
								<span className="flex flex-col">
									<span className="text-text text-sm font-semibold">{each.label}</span>
									<span className="text-text-muted text-xs">{each.help}</span>
								</span>
							</button>
						))}
					</div>
				)}
				<fieldset
					hidden={searching}
					disabled={disabledNote !== null}
					className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
				>
					{disabledNote && (
						<p role="note" className="bg-surface-inset text-text rounded-lg p-3 text-sm">
							{disabledNote}
						</p>
					)}
					{tools.map((each) => (
						<div
							key={each.id}
							hidden={each.id !== open}
							data-tool={each.id}
							className="flex flex-col gap-4"
						>
							{each.panel}
						</div>
					))}
				</fieldset>
			</div>
		</section>
	)
}
