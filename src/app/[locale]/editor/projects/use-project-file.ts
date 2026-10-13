import { useEffect, useEffectEvent, useState, type RefObject } from 'react'
import type { useTranslations } from 'next-intl'
import type { QueryClient } from '@tanstack/react-query'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { toast } from '@/lib/toast'
import type { useTakeAnalysis } from '../audio/use-take-analysis'
import { decodeAudio } from '../audio/take-audio'
import type { Transcript } from '../audio/transcript'
import type { SaveStatus } from '../components/panels/project-panel'
import type { EditSnapshot } from '../model/edit-snapshot'
import type { History } from '../model/history'
import {
	deleteProject,
	isStorageFull,
	missingMedia,
	openProject,
	relinkMedia,
	saveProject,
	type MediaRef
} from './projects'

/** Once saved, a project saves itself this long after the last change. */
const AUTOSAVE_DELAY_MS = 1500
export const PROJECTS_KEY = ['projects']

/**
 * The project being edited: saving it, opening a saved one (relinking media
 * the browser no longer holds), deleting one, and saving itself after each
 * change once it has been saved.
 */
export function useProjectFile({
	t,
	video,
	analysis,
	history,
	snapshot,
	setSavedHistory,
	queryClient,
	playback,
	loadFile,
	applySnapshot,
	addedUrlsRef,
	trim,
	cuts,
	clips,
	replacements,
	title,
	watermark,
	captionsOn,
	annotations,
	transform,
	color,
	captionStyle,
	audioItems,
	addedVideos,
	sourceTrims,
	lowerThird,
	zoom
}: {
	t: ReturnType<typeof useTranslations<'Editor'>>
	video: { file: File } | null
	analysis: ReturnType<typeof useTakeAnalysis>
	history: History<EditSnapshot>
	snapshot: EditSnapshot
	setSavedHistory: (saved: History<EditSnapshot> | null) => void
	queryClient: QueryClient
	playback: { pause: () => void }
	loadFile: (file: File, transcript?: Transcript | null) => void
	applySnapshot: (saved: EditSnapshot) => void
	addedUrlsRef: RefObject<string[]>
	// The edit's pieces autosave watches: only compared, never read here.
	trim: unknown
	cuts: unknown
	clips: unknown
	replacements: unknown
	title: unknown
	watermark: unknown
	captionsOn: unknown
	annotations: unknown
	transform: unknown
	color: unknown
	captionStyle: unknown
	audioItems: unknown
	addedVideos: unknown
	sourceTrims: unknown
	lowerThird: unknown
	zoom: unknown
}) {
	// The project being edited once saved, and how its saving stands.
	const [project, setProject] = useState<{ id: string; name: string } | null>(null)
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('unsaved')
	const [savedAt, setSavedAt] = useState<number | null>(null)
	// A project to open whose media the browser no longer holds: what to find.
	const [relink, setRelink] = useState<{ id: string; missing: MediaRef[] } | null>(null)

	/** Saves the project under `name` (a new one the first time): its media once, its edit each time. */
	async function save(name: string) {
		if (!video) return
		const id = project?.id ?? crypto.randomUUID()
		// Outside the try: the React Compiler can't compile a `? :` inside one.
		const transcript =
			analysis.transcript.status === 'ready' ? analysis.transcript.transcript : null
		setSaveStatus('saving')
		// What this save holds: a change made while it runs is still unsaved.
		const saving = history
		try {
			const at = await saveProject({
				id,
				name,
				main: video.file,
				transcript,
				edit: snapshot
			})
			setProject({ id, name })
			setSaveStatus('saved')
			setSavedAt(at)
			setSavedHistory(saving)
			void queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })
		} catch (error) {
			const { userMessage } = captureClientError(error, { feature: 'save_project' })
			setSaveStatus('failed')
			toast({
				variant: 'destructive',
				title: t('projects.saveFailed'),
				description: isStorageFull(error) ? t('projects.storageFull') : userMessage
			})
		}
	}

	/**
	 * Opens a saved project in place of this edit: its media found first (or
	 * asked for, when the browser no longer holds it), then its video, its
	 * transcript and its edit, with no history.
	 */
	async function openSaved(id: string) {
		try {
			const missing = await missingMedia(id)
			if (missing.length > 0) {
				setRelink({ id, missing })
				return
			}
			const opened = await openProject(id, decodeAudio)
			if (!opened) {
				toast({ variant: 'destructive', title: t('projects.cantOpen') })
				return
			}
			playback.pause()
			setRelink(null)
			loadFile(opened.main, opened.transcript)
			applySnapshot(opened.edit)
			addedUrlsRef.current.push(...opened.urls)
			setProject({ id: opened.id, name: opened.name })
			setSaveStatus('saved')
			setSavedAt(opened.savedAt)
		} catch (error) {
			const { userMessage } = captureClientError(error, { feature: 'open_project' })
			toast({ variant: 'destructive', title: t('projects.cantOpen'), description: userMessage })
		}
	}

	/** A file picked for missing media: kept if it's the same file, then opening goes on. */
	async function relinkFile(ref: MediaRef, file: File) {
		if (!relink) return
		if (!(await relinkMedia(ref, file))) {
			toast({
				variant: 'destructive',
				title: t('projects.wrongFile', { name: file.name, wanted: ref.name })
			})
			return
		}
		const missing = relink.missing.filter((m) => m.key !== ref.key)
		if (missing.length > 0) setRelink({ ...relink, missing })
		else void openSaved(relink.id)
	}

	async function removeProject(id: string) {
		await deleteProject(id)
		if (project?.id === id) {
			setProject(null)
			setSaveStatus('unsaved')
		}
		void queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })
	}

	// Once saved, the project saves itself a moment after each change to the
	// edit (any of the snapshot's pieces; not playback or the playhead).
	const autosave = useEffectEvent(() => {
		if (project && saveStatus !== 'saving') void save(project.name)
	})
	// The project's id, not its object: a save sets it again, and that's no change.
	const projectId = project?.id
	useEffect(() => {
		const timer = setTimeout(autosave, AUTOSAVE_DELAY_MS)
		return () => clearTimeout(timer)
	}, [
		projectId,
		trim,
		cuts,
		clips,
		replacements,
		title,
		watermark,
		captionsOn,
		annotations,
		transform,
		color,
		captionStyle,
		audioItems,
		addedVideos,
		sourceTrims,
		lowerThird,
		zoom
	])

	return {
		project,
		setProject,
		saveStatus,
		setSaveStatus,
		savedAt,
		relink,
		setRelink,
		save,
		openSaved,
		relinkFile,
		removeProject
	}
}
