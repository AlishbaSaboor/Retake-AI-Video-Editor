'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { PlusIcon, ProjectsIcon, SearchIcon } from '@/components/ui/icons'
import { listProjects } from '@/app/[locale]/editor/projects'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { ProjectCard } from './project-card'
import { shown, type Sort } from './project-filter'

const SKELETONS = 3
const SORTS: readonly Sort[] = ['edited', 'name']

/**
 * The projects saved in this browser, each opening in the editor: found by
 * name, sorted by when they were last edited or by name.
 */
export function ProjectGrid() {
	const t = useTranslations('Site.projects')
	const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
	const [query, setQuery] = useState('')
	const [sort, setSort] = useState<Sort>('edited')

	if (projects.isPending) {
		return (
			<ul aria-busy className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: SKELETONS }, (_, index) => (
					<li
						key={index}
						className="border-border bg-surface aspect-[4/3] animate-pulse rounded-[22px] border"
					/>
				))}
			</ul>
		)
	}

	if (!projects.data?.length) {
		return (
			<div className="border-border-strong bg-surface flex flex-col items-center gap-4 rounded-[22px] border border-dashed px-6 py-16 text-center">
				<span className="bg-accent-soft text-accent-fg flex size-12 items-center justify-center rounded-[14px]">
					<ProjectsIcon size={24} />
				</span>
				<div className="flex flex-col gap-1">
					<h2 className="text-text text-lg font-extrabold">{t('empty.title')}</h2>
					<p className="text-text-muted text-sm">{t('empty.body')}</p>
				</div>
				<Button asChild size="lg">
					<Link href="/home">
						<PlusIcon />
						{t('new')}
					</Link>
				</Button>
			</div>
		)
	}

	const list = shown(projects.data, query, sort)
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center gap-3">
				<label className="border-border bg-surface focus-within:border-accent/60 focus-within:ring-accent-soft flex h-11 w-full items-center gap-2.5 rounded-xl border px-3.5 transition-shadow focus-within:ring-4 sm:w-[360px]">
					<SearchIcon size={17} className="text-text-faint" />
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						aria-label={t('search')}
						placeholder={t('search')}
						className="placeholder:text-text-faint h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none"
					/>
				</label>
				<div
					role="radiogroup"
					aria-label={t('sort')}
					className="border-border bg-glass flex rounded-xl border p-1"
				>
					{SORTS.map((each) => (
						<button
							key={each}
							type="button"
							role="radio"
							aria-checked={sort === each}
							onClick={() => setSort(each)}
							className={cn(
								'focus-visible:outline-accent h-[34px] rounded-[9px] px-3.5 text-sm font-bold transition-colors focus-visible:outline-2',
								sort === each ? 'bg-selected text-text' : 'text-text-muted hover:text-text'
							)}
						>
							{each === 'edited' ? t('sortEdited') : t('sortName')}
						</button>
					))}
				</div>
				<span className="text-text-faint ml-auto text-sm" aria-live="polite">
					{t('count', { count: list.length })}
				</span>
			</div>
			{list.length === 0 ? (
				<p className="text-text-muted py-12 text-center">{t('noMatch', { query: query.trim() })}</p>
			) : (
				<ul aria-label={t('listLabel')} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{list.map((project) => (
						<li key={project.id}>
							<ProjectCard project={project} />
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
