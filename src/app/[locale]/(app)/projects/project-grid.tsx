'use client'

import { useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { PlusIcon, ProjectsIcon } from '@/components/ui/icons'
import { listProjects } from '@/app/[locale]/editor/projects'
import { Link } from '@/i18n/routing'
import { ProjectThumbnail } from './project-thumbnail'

const SKELETONS = 3

/** The projects saved in this browser, newest first, each opening in the editor. */
export function ProjectGrid() {
	const t = useTranslations('Site.projects')
	const format = useFormatter()
	const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })

	if (projects.isPending) {
		return (
			<ul aria-busy className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: SKELETONS }, (_, index) => (
					<li
						key={index}
						className="border-border bg-surface aspect-[4/3] animate-pulse rounded-lg border"
					/>
				))}
			</ul>
		)
	}

	if (!projects.data?.length) {
		return (
			<div className="border-border bg-surface flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-16 text-center">
				<span className="bg-accent-soft text-accent flex size-12 items-center justify-center rounded-lg">
					<ProjectsIcon size={24} />
				</span>
				<div className="flex flex-col gap-1">
					<h2 className="text-text font-semibold">{t('empty.title')}</h2>
					<p className="text-text-muted text-sm">{t('empty.body')}</p>
				</div>
				<Button asChild>
					<Link href="/home">
						<PlusIcon />
						{t('new')}
					</Link>
				</Button>
			</div>
		)
	}

	return (
		<ul aria-label={t('listLabel')} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{projects.data.map((project) => (
				<li key={project.id}>
					<Link
						href={{ pathname: '/editor', query: { project: project.id } }}
						className="group border-border bg-surface hover:border-accent focus-visible:outline-accent flex flex-col overflow-hidden rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
					>
						<ProjectThumbnail id={project.id} savedAt={project.savedAt} />
						<div className="flex flex-col gap-1 p-4">
							<span className="text-text truncate font-semibold">{project.name}</span>
							<span className="text-text-muted text-sm">
								{t('edited', {
									when: format.dateTime(project.savedAt, {
										dateStyle: 'medium',
										timeStyle: 'short'
									})
								})}
							</span>
						</div>
					</Link>
				</li>
			))}
		</ul>
	)
}
