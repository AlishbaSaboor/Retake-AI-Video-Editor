'use client'

import { useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { ArrowRightIcon } from '@/components/ui/icons'
import { listProjects } from '@/app/[locale]/editor/projects'
import { Link } from '@/i18n/routing'
import { ProjectThumbnail } from '../projects/project-thumbnail'

const SHOWN = 3

/** The last few projects saved in this browser, to carry on with; nothing at all when there are none. */
export function RecentProjects() {
	const t = useTranslations('Site.home.recent')
	const format = useFormatter()
	const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
	const recent = projects.data?.slice(0, SHOWN) ?? []
	if (recent.length === 0) return null
	return (
		<section aria-labelledby="recent" className="mt-8 flex flex-col gap-4">
			<div className="flex items-end justify-between gap-4">
				<h2 id="recent" className="text-text text-[22px] font-extrabold">
					{t('title')}
				</h2>
				<Link
					href="/projects"
					className="text-accent-fg focus-visible:outline-accent inline-flex items-center gap-1.5 rounded text-sm font-bold hover:underline focus-visible:outline-2"
				>
					{t('all')}
					<ArrowRightIcon size={14} />
				</Link>
			</div>
			<ul className="grid gap-4 md:grid-cols-3">
				{recent.map((project) => (
					<li key={project.id}>
						<Link
							href={{ pathname: '/editor', query: { project: project.id } }}
							className="group rt-lift border-border bg-glass hover:border-border-strong focus-visible:outline-accent flex items-center gap-4 rounded-[18px] border p-3 transition-colors focus-visible:outline-2"
						>
							<span className="w-[104px] shrink-0 overflow-hidden rounded-[11px]">
								<ProjectThumbnail id={project.id} savedAt={project.savedAt} />
							</span>
							<span className="flex min-w-0 flex-col">
								<span className="text-text truncate text-[15px] font-extrabold">
									{project.name}
								</span>
								<span className="text-text-faint text-[13px]">
									{format.dateTime(project.savedAt, { dateStyle: 'medium', timeStyle: 'short' })}
								</span>
							</span>
						</Link>
					</li>
				))}
			</ul>
		</section>
	)
}
