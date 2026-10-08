import type { ProjectSummary } from '@/app/[locale]/editor/projects'

export type Sort = 'edited' | 'name'

/**
 * The projects whose name holds every word typed (any case, any order), by
 * last edit (as given: newest first) or by name.
 */
export function shown(projects: ProjectSummary[], query: string, sort: Sort): ProjectSummary[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean)
	const found = projects.filter(({ name }) =>
		words.every((word) => name.toLowerCase().includes(word))
	)
	return sort === 'name' ? [...found].sort((a, b) => a.name.localeCompare(b.name)) : found
}
