'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CloseIcon, SearchIcon } from '@/components/ui/icons'

/** One tool panel in the column: its name and other words to find it by, and the panel. */
export type Tool = {
	id: string
	title: string
	/** More words someone might search for: what the panel does, in plain terms. */
	keywords: string
	panel: React.ReactNode
	/** A heading for a panel that has none of its own. */
	heading?: boolean
}

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
 * The editing tools, one panel each, under a search box: typing narrows
 * them to the ones whose name or keywords match. Panels filtered out stay
 * mounted (hidden), so nothing typed in them is lost.
 */
export function ToolPanels({ tools }: { tools: Tool[] }) {
	const t = useTranslations('Editor.tools')
	const [query, setQuery] = useState('')
	const shown = tools.filter((tool) => toolMatches(tool, query))
	return (
		<section aria-label={t('label')} className="flex h-full min-h-0 flex-col">
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
				{query && (
					<p role="status" className="text-text-faint mt-2 text-xs">
						{shown.length ? t('found', { count: shown.length }) : t('none', { query })}
					</p>
				)}
			</div>
			<div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
				{tools.map((tool) => (
					<div key={tool.id} hidden={!shown.includes(tool)} data-tool={tool.id}>
						{tool.heading ? (
							<div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
								<h2 className="text-text text-xs font-bold tracking-wider uppercase">
									{tool.title}
								</h2>
								{tool.panel}
							</div>
						) : (
							tool.panel
						)}
					</div>
				))}
			</div>
		</section>
	)
}
