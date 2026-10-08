'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CloseIcon, SearchIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * The rail's groups, top to bottom: the project; the assistant and the
 * transcript; then fixing what's there, adding to it, adjusting how it looks.
 */
export const TOOL_GROUPS = ['project', 'assist', 'fix', 'add', 'adjust'] as const
export type ToolGroup = (typeof TOOL_GROUPS)[number]
/** Groups with no label over them: a line sets them apart instead. */
const UNLABELLED: readonly ToolGroup[] = ['project', 'assist']

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
	/** Its panel fills the column and scrolls itself (the assistant's chat). */
	fill?: boolean
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

// Inside a panel, everything is a size down and quieter than the app's
// defaults: field labels, legends and sub-headings small and muted, buttons
// and fields at 13 px.
const QUIET_PANEL = cn(
	'text-[13px]',
	'[&_label]:text-text-muted [&_label]:text-xs [&_label]:font-normal',
	'[&_legend]:text-text-muted [&_legend]:text-xs [&_legend]:font-normal',
	'[&_h2]:text-text-faint [&_h2]:text-[11px] [&_h2]:font-medium [&_h2]:tracking-wide',
	'[&_h3]:text-text-muted [&_h3]:text-xs [&_h3]:font-medium [&_h3]:tracking-normal [&_h3]:normal-case',
	'[&_button]:font-normal [&_button]:text-[13px] [&_input]:text-[13px] [&_select]:text-[13px] [&_textarea]:text-[13px]'
)

/**
 * The tools: a narrow rail of icons and names in groups, and beside it the
 * open tool's panel, with its heading, a line about it and a search across
 * every tool. One tool is always open; the panel as a whole is hidden and
 * shown from the editor's edge (editor-shell.tsx). Every panel stays mounted
 * (hidden when not shown), so nothing typed in one is lost by switching away.
 */
export function ToolRail({
	tools,
	open,
	onOpen,
	disabledNote = null
}: {
	tools: Tool[]
	/** The open tool's id. */
	open: string
	onOpen: (id: string) => void
	/** Why nothing in the panels can be changed right now (the Original view); null when it can. */
	disabledNote?: string | null
}) {
	const t = useTranslations('Editor.tools')
	const [query, setQuery] = useState('')
	const searching = query.trim() !== ''
	const tool = tools.find((each) => each.id === open) ?? tools[0]
	const found = searching ? tools.filter((each) => toolMatches(each, query)) : []
	const fill = !searching && tool?.fill === true

	function choose(id: string) {
		setQuery('')
		onOpen(id)
	}

	return (
		<section aria-label={t('label')} className="flex h-full min-h-0 max-lg:flex-col">
			<div
				role="tablist"
				aria-label={t('tabsLabel')}
				aria-orientation="vertical"
				className="border-border flex min-h-0 w-[4.5rem] shrink-0 flex-col gap-0.5 overflow-y-auto border-r px-1 py-2 max-lg:w-full max-lg:flex-row max-lg:overflow-x-auto max-lg:border-r-0 max-lg:border-b"
			>
				{TOOL_GROUPS.map((group) => {
					const inGroup = tools.filter((each) => each.group === group)
					if (inGroup.length === 0) return null
					return (
						<div
							key={group}
							role="presentation"
							className={cn(
								'flex flex-col gap-0.5 max-lg:flex-row',
								UNLABELLED.includes(group) &&
									'border-border border-b pb-1.5 max-lg:border-r max-lg:border-b-0 max-lg:pr-1 max-lg:pb-0'
							)}
						>
							{!UNLABELLED.includes(group) && (
								<p
									role="presentation"
									className="text-text-faint pt-1.5 pb-0.5 text-center font-mono text-[9px] tracking-widest uppercase max-lg:hidden"
								>
									{t(`groups.${group}`)}
								</p>
							)}
							{inGroup.map((each) => {
								const selected = each.id === tool?.id
								return (
									<button
										key={each.id}
										type="button"
										role="tab"
										id={`tool-tab-${each.id}`}
										aria-selected={selected}
										aria-controls="tool-panel"
										title={each.help}
										onClick={() => choose(each.id)}
										className={cn(
											'focus-visible:outline-accent flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 text-center text-[10.5px] leading-tight transition-colors focus-visible:outline-2 max-lg:w-16',
											selected
												? 'bg-accent-soft text-accent-fg font-medium'
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
				role="tabpanel"
				aria-labelledby={tool ? `tool-tab-${tool.id}` : undefined}
				className="border-border flex min-h-0 w-[min(21rem,calc(100vw-5rem))] shrink-0 flex-col border-r max-lg:w-full max-lg:border-r-0"
			>
				<div className="flex flex-col gap-3 px-5 pt-5 pb-4">
					<div className="flex flex-col gap-0.5">
						<h2 className="text-text text-[15px] font-semibold">{tool?.label}</h2>
						<p className="text-text-faint text-xs leading-snug">{tool?.help}</p>
					</div>
					<div className="border-border focus-within:border-accent flex items-center gap-2 rounded-md border px-2 transition-colors">
						<SearchIcon size={14} className="text-text-faint" />
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
							className="text-text placeholder:text-text-faint h-8 w-full bg-transparent text-[13px] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
						/>
						{query && (
							<button
								type="button"
								aria-label={t('clear')}
								onClick={() => setQuery('')}
								className="text-text-faint hover:text-text"
							>
								<CloseIcon size={14} />
							</button>
						)}
					</div>
				</div>
				{searching && (
					<div role="region" aria-label={t('results')} className="flex flex-col gap-1 px-5 pb-5">
						<p role="status" className="text-text-faint pb-1 text-xs">
							{found.length ? t('found', { count: found.length }) : t('none', { query })}
						</p>
						{found.map((each) => (
							<button
								key={each.id}
								type="button"
								onClick={() => choose(each.id)}
								className="hover:bg-surface-hover focus-visible:outline-accent flex items-center gap-3 rounded-md px-2 py-2 text-left focus-visible:outline-2"
							>
								<span className="text-text-muted">{each.icon}</span>
								<span className="flex flex-col">
									<span className="text-text text-[13px] font-medium">{each.label}</span>
									<span className="text-text-faint text-xs">{each.help}</span>
								</span>
							</button>
						))}
					</div>
				)}
				<fieldset
					hidden={searching}
					disabled={disabledNote !== null}
					className={cn(
						'relative flex min-h-0 min-w-0 flex-1 flex-col',
						!fill && 'gap-6 overflow-y-auto px-5 pb-6',
						QUIET_PANEL
					)}
				>
					{disabledNote && (
						<p role="note" className="text-text-muted mx-5 rounded-md text-xs">
							{disabledNote}
						</p>
					)}
					{tools.map((each) => (
						<div
							key={each.id}
							hidden={each.id !== tool?.id}
							data-tool={each.id}
							className={cn(
								'flex-col gap-6',
								each.id === tool?.id && 'flex',
								each.fill && 'min-h-0 flex-1'
							)}
						>
							{each.panel}
						</div>
					))}
				</fieldset>
			</div>
		</section>
	)
}
