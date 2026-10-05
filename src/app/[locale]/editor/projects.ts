import type { AudioItem } from './audio-lane'
import type { EditSnapshot } from './edit-snapshot'
import type { ReplacementTake } from './re-record'
import type { AddedVideo } from './sources'
import type { Transcript } from './transcript'

// Saved projects, in this browser (IndexedDB): nothing leaves it, as nothing
// else in the editor does. A project is its name, its edit (the undo
// snapshot: everything that defines the edit, not the history of how it
// got there), the main video's transcript, and references to its media.
// Media is kept apart, each piece once, by a key from the file's name,
// size and modification time: the videos (copied in on first save), and
// added audio files. Re-recorded takes are short and stored as their
// samples. An extracted clip's sound is decoded from its video again.
// PROGRESS_NOTES.md section 3r.

/** Bumped when what's stored changes shape: a project of another version is refused, not half-loaded. */
export const PROJECT_VERSION = 1

const DATABASE = 'retake'
const PROJECTS = 'projects'
const MEDIA = 'media'

/** A piece of media a project uses: where it's kept, and what it was, to find it again. */
export type MediaRef = { key: string; name: string; type: string; size: number }

type StoredBuffer = { sampleRate: number; channels: Float32Array[] }
type StoredTake = Omit<ReplacementTake, 'audio'> & { audio: StoredBuffer }
type StoredAudioItem = Omit<AudioItem, 'buffer' | 'origin'> & {
	origin: { kind: 'file'; media: MediaRef } | { kind: 'video'; source?: string }
}
type StoredAdded = Omit<AddedVideo, 'file' | 'url'> & { media: MediaRef }
type StoredEdit = Omit<EditSnapshot, 'replacements' | 'audioItems' | 'addedVideos'> & {
	replacements: StoredTake[]
	audioItems: StoredAudioItem[]
	addedVideos: StoredAdded[]
}

export type StoredProject = {
	id: string
	name: string
	savedAt: number
	version: number
	main: MediaRef
	transcript: Transcript | null
	edit: StoredEdit
}

export type ProjectSummary = { id: string; name: string; savedAt: number }

/** Where a file is kept: the same file saved twice is kept once. */
export function mediaKey(file: { name: string; size: number; lastModified?: number }): string {
	return `${file.name}|${file.size}|${file.lastModified ?? 0}`
}

function refFor(file: Blob & { name?: string; lastModified?: number }, name: string): MediaRef {
	return {
		key: mediaKey({ name, size: file.size, lastModified: file.lastModified }),
		name,
		type: file.type,
		size: file.size
	}
}

/** Whether a file picked to stand in for missing media is the same one: its name and size. */
export function fileMatches(ref: MediaRef, file: { name: string; size: number }): boolean {
	return file.name === ref.name && file.size === ref.size
}

/**
 * The saved project a typed name means: the same name, ignoring case and
 * spaces at the ends, else the most recently saved one whose name contains
 * it (or is contained in it). Null when none does.
 */
export function findProject(projects: ProjectSummary[], name: string): ProjectSummary | null {
	const wanted = name.trim().toLowerCase()
	if (!wanted) return null
	const byRecent = [...projects].sort((a, b) => b.savedAt - a.savedAt)
	return (
		byRecent.find((p) => p.name.trim().toLowerCase() === wanted) ??
		byRecent.find((p) => {
			const have = p.name.trim().toLowerCase()
			return have.includes(wanted) || wanted.includes(have)
		}) ??
		null
	)
}

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}

function open(): Promise<IDBDatabase> {
	const req = indexedDB.open(DATABASE, 1)
	req.onupgradeneeded = () => {
		req.result.createObjectStore(PROJECTS, { keyPath: 'id' })
		req.result.createObjectStore(MEDIA)
	}
	return request(req)
}

async function withStore<T>(
	name: typeof PROJECTS | typeof MEDIA,
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await open()
	try {
		return await request(run(db.transaction(name, mode).objectStore(name)))
	} finally {
		db.close()
	}
}

/** Keeps a piece of media unless it's kept already (a video is written once, on first save). */
async function keepMedia(ref: MediaRef, blob: Blob) {
	const kept = await withStore(MEDIA, 'readonly', (store) => store.count(ref.key))
	if (kept === 0) await withStore(MEDIA, 'readwrite', (store) => store.put(blob, ref.key))
}

function storeBuffer(buffer: AudioBuffer): StoredBuffer {
	return {
		sampleRate: buffer.sampleRate,
		channels: Array.from({ length: buffer.numberOfChannels }, (_, c) =>
			buffer.getChannelData(c).slice()
		)
	}
}

function loadBuffer(stored: StoredBuffer): AudioBuffer {
	const length = stored.channels[0]?.length ?? 1
	const buffer = new AudioBuffer({
		length: Math.max(1, length),
		numberOfChannels: Math.max(1, stored.channels.length),
		sampleRate: stored.sampleRate
	})
	for (const [c, samples] of stored.channels.entries()) {
		buffer.copyToChannel(new Float32Array(samples), c)
	}
	return buffer
}

/**
 * Saves a project: its media first (each piece once), then the record. The
 * browser is asked to keep this site's storage, so it isn't cleared to free
 * space without asking.
 */
export async function saveProject(project: {
	id: string
	name: string
	main: File
	transcript: Transcript | null
	edit: EditSnapshot
}): Promise<number> {
	const { edit } = project
	const main = refFor(project.main, project.main.name)
	await keepMedia(main, project.main)
	const addedVideos: StoredAdded[] = []
	for (const added of edit.addedVideos) {
		const media = refFor(added.file, added.file.name)
		await keepMedia(media, added.file)
		addedVideos.push({
			id: added.id,
			name: added.name,
			durationSeconds: added.durationSeconds,
			width: added.width,
			height: added.height,
			media
		})
	}
	const audioItems: StoredAudioItem[] = []
	for (const item of edit.audioItems) {
		const { origin } = item
		const rest = {
			id: item.id,
			name: item.name,
			pieces: item.pieces,
			skipSeconds: item.skipSeconds,
			seconds: item.seconds,
			atSeconds: item.atSeconds,
			volume: item.volume,
			muted: item.muted
		}
		if (origin.kind === 'file') {
			const media = refFor(origin.file, item.name)
			await keepMedia(media, origin.file)
			audioItems.push({ ...rest, origin: { kind: 'file', media } })
		} else {
			audioItems.push({ ...rest, origin })
		}
	}
	const stored: StoredProject = {
		id: project.id,
		name: project.name,
		savedAt: Date.now(),
		version: PROJECT_VERSION,
		main,
		transcript: project.transcript,
		edit: {
			...edit,
			replacements: edit.replacements.map((take) => ({ ...take, audio: storeBuffer(take.audio) })),
			audioItems,
			addedVideos
		}
	}
	await withStore(PROJECTS, 'readwrite', (store) => store.put(stored))
	void navigator.storage?.persist?.()
	return stored.savedAt
}

/** The saved projects, most recent first. */
export async function listProjects(): Promise<ProjectSummary[]> {
	const all = await withStore<StoredProject[]>(PROJECTS, 'readonly', (store) => store.getAll())
	return all
		.map(({ id, name, savedAt }) => ({ id, name, savedAt }))
		.sort((a, b) => b.savedAt - a.savedAt)
}

/** What a project's media are, and which aren't in the browser's storage any more. */
export async function missingMedia(id: string): Promise<MediaRef[]> {
	const project = await withStore<StoredProject | undefined>(PROJECTS, 'readonly', (store) =>
		store.get(id)
	)
	if (!project) return []
	const refs = [
		project.main,
		...project.edit.addedVideos.map((added) => added.media),
		...project.edit.audioItems.flatMap((item) =>
			item.origin.kind === 'file' ? [item.origin.media] : []
		)
	]
	const missing: MediaRef[] = []
	for (const ref of refs) {
		const kept = await withStore(MEDIA, 'readonly', (store) => store.count(ref.key))
		if (kept === 0 && !missing.some((m) => m.key === ref.key)) missing.push(ref)
	}
	return missing
}

/** A file picked to stand in for missing media, kept under its key once it matches. */
export async function relinkMedia(ref: MediaRef, file: File): Promise<boolean> {
	if (!fileMatches(ref, file)) return false
	await withStore(MEDIA, 'readwrite', (store) => store.put(file, ref.key))
	return true
}

async function mediaFile(ref: MediaRef): Promise<File> {
	const blob = await withStore<Blob | undefined>(MEDIA, 'readonly', (store) => store.get(ref.key))
	if (!blob) throw new Error(`missing media ${ref.name}`)
	return new File([blob], ref.name, { type: ref.type || blob.type })
}

/** A project's main video, for a preview picture; null when the project or the video is gone. */
export async function projectVideo(id: string): Promise<File | null> {
	const project = await withStore<StoredProject | undefined>(PROJECTS, 'readonly', (store) =>
		store.get(id)
	)
	return project ? mediaFile(project.main).catch(() => null) : null
}

/** A project opened: its main video, its transcript, and its edit as the editor holds it. */
export type OpenedProject = {
	id: string
	name: string
	savedAt: number
	main: File
	transcript: Transcript | null
	edit: EditSnapshot
	/** Every URL made for its added videos, for the editor to release with them. */
	urls: string[]
}

/**
 * Opens a saved project (all its media present: check with missingMedia
 * first). Takes become audio again; added videos files with URLs; added
 * audio files and extracted sounds are decoded (`decode`, for the sound of
 * a file or of a video).
 */
export async function openProject(
	id: string,
	decode: (file: Blob) => Promise<AudioBuffer | null>
): Promise<OpenedProject | null> {
	const project = await withStore<StoredProject | undefined>(PROJECTS, 'readonly', (store) =>
		store.get(id)
	)
	if (!project || project.version !== PROJECT_VERSION) return null
	const main = await mediaFile(project.main)
	const urls: string[] = []
	const addedVideos: AddedVideo[] = []
	for (const { media, ...added } of project.edit.addedVideos) {
		const file = await mediaFile(media)
		const url = URL.createObjectURL(file)
		urls.push(url)
		addedVideos.push({ ...added, file, url })
	}
	// Each video's sound decoded once, for the sounds taken out of its clips.
	const videoSounds = new Map<string, Promise<AudioBuffer | null>>()
	const soundOf = (source: string | undefined) => {
		const key = source ?? ''
		const file = source ? addedVideos.find((added) => added.id === source)?.file : main
		const decoding = videoSounds.get(key) ?? (file ? decode(file) : Promise.resolve(null))
		videoSounds.set(key, decoding)
		return decoding
	}
	const audioItems: AudioItem[] = []
	for (const { origin, ...item } of project.edit.audioItems) {
		if (origin.kind === 'file') {
			const file = await mediaFile(origin.media)
			const buffer = await decode(file)
			if (buffer) audioItems.push({ ...item, buffer, origin: { kind: 'file', file } })
		} else {
			const buffer = await soundOf(origin.source)
			if (buffer) audioItems.push({ ...item, buffer, origin })
		}
	}
	return {
		id: project.id,
		name: project.name,
		savedAt: project.savedAt,
		main,
		transcript: project.transcript,
		urls,
		edit: {
			...project.edit,
			replacements: project.edit.replacements.map((take) => ({
				...take,
				audio: loadBuffer(take.audio)
			})),
			audioItems,
			addedVideos
		}
	}
}

/** A project renamed: only its name changes, not when it was last edited. False when it's gone. */
export async function renameProject(id: string, name: string): Promise<boolean> {
	const project = await withStore<StoredProject | undefined>(PROJECTS, 'readonly', (store) =>
		store.get(id)
	)
	if (!project) return false
	await withStore(PROJECTS, 'readwrite', (store) => store.put({ ...project, name }))
	return true
}

/** Deletes a project, and any media no other project uses. */
export async function deleteProject(id: string): Promise<void> {
	await withStore(PROJECTS, 'readwrite', (store) => store.delete(id))
	const rest = await withStore<StoredProject[]>(PROJECTS, 'readonly', (store) => store.getAll())
	const used = new Set(
		rest.flatMap((project) => [
			project.main.key,
			...project.edit.addedVideos.map((added) => added.media.key),
			...project.edit.audioItems.flatMap((item) =>
				item.origin.kind === 'file' ? [item.origin.media.key] : []
			)
		])
	)
	const keys = await withStore<IDBValidKey[]>(MEDIA, 'readonly', (store) => store.getAllKeys())
	for (const key of keys) {
		if (typeof key === 'string' && !used.has(key)) {
			await withStore(MEDIA, 'readwrite', (store) => store.delete(key))
		}
	}
}
