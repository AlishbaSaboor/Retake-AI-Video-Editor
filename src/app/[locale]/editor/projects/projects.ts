import type { AudioItem } from '../model/audio-lane'
import type { EditSnapshot } from '../model/edit-snapshot'
import type { ReplacementTake } from '../audio/re-record'
import type { AddedVideo } from '../model/sources'
import type { Transcript } from '../audio/transcript'

// Saved projects, in this browser (IndexedDB): projects and their media are
// never uploaded. A project is its name, its edit (the undo snapshot:
// everything that defines the edit, not the history of how it got there),
// the main video's transcript, and references to its media. Media is kept
// apart, each piece once, by a key from the file's name, size and
// modification time: the videos (copied in on first save), and added audio
// files. Re-recorded takes are short and stored as their samples. An
// extracted clip's sound is decoded from its video again. A save is one
// transaction, done only once it commits. PROGRESS_NOTES.md sections 3r, 3zu.

/** Bumped when what's stored changes shape: a project of another version is refused, not half-loaded. */
export const PROJECT_VERSION = 1

const DATABASE = 'retake'
const PROJECTS = 'projects'
const MEDIA = 'media'

/**
 * A piece of media a project uses: where it's kept, and what it was, to find
 * it again. `fingerprint` (mediaFingerprint) is absent in projects saved
 * before it existed.
 */
export type MediaRef = {
	key: string
	name: string
	type: string
	size: number
	fingerprint?: string
}

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

/** How much of each end of a file its fingerprint reads. */
const FINGERPRINT_END_BYTES = 1024 * 1024
// Fingerprinted once per file: an autosave after each change doesn't read it again.
const fingerprints = new WeakMap<Blob, Promise<string>>()

/**
 * What tells one file from another of the same name and size: a SHA-256 of
 * its size, its first megabyte and its last. Reads at most 2 MB, whatever
 * the file's length.
 */
export function mediaFingerprint(file: Blob): Promise<string> {
	const known = fingerprints.get(file)
	if (known) return known
	const size = new TextEncoder().encode(String(file.size))
	const ends =
		file.size <= FINGERPRINT_END_BYTES * 2
			? [file]
			: [file.slice(0, FINGERPRINT_END_BYTES), file.slice(file.size - FINGERPRINT_END_BYTES)]
	const hashing = new Blob([size, ...ends])
		.arrayBuffer()
		.then((bytes) => crypto.subtle.digest('SHA-256', bytes))
		.then((digest) =>
			Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
		)
	fingerprints.set(file, hashing)
	return hashing
}

async function refFor(
	file: Blob & { name?: string; lastModified?: number },
	name: string
): Promise<MediaRef> {
	return {
		key: mediaKey({ name, size: file.size, lastModified: file.lastModified }),
		name,
		type: file.type,
		size: file.size,
		fingerprint: await mediaFingerprint(file)
	}
}

/**
 * Whether a file picked to stand in for missing media is the same one: its
 * name and size, and its fingerprint when the project saved one (older
 * projects have only the name and size to go on).
 */
export async function fileMatches(ref: MediaRef, file: File): Promise<boolean> {
	if (file.name !== ref.name || file.size !== ref.size) return false
	return ref.fingerprint === undefined || (await mediaFingerprint(file)) === ref.fingerprint
}

/** Whether a save failed because the browser's storage for this site is full. */
export function isStorageFull(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'QuotaExceededError'
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

/**
 * Settles when `tx` has committed, or fails with why it was aborted: a
 * write's request can succeed and the transaction still be aborted when it
 * commits (the browser's storage being full, for one).
 */
function committed(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve()
		tx.onabort = () => reject(tx.error ?? new DOMException('The save was aborted', 'AbortError'))
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
		const tx = db.transaction(name, mode)
		const [result] = await Promise.all([request(run(tx.objectStore(name))), committed(tx)])
		return result
	} finally {
		db.close()
	}
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
	// Every file the project uses, each kept once (a video is written on first save only).
	const files: { ref: MediaRef; blob: Blob }[] = []
	const keep = async (blob: Blob & { lastModified?: number }, name: string) => {
		const ref = await refFor(blob, name)
		files.push({ ref, blob })
		return ref
	}
	const main = await keep(project.main, project.main.name)
	const addedVideos: StoredAdded[] = []
	for (const added of edit.addedVideos) {
		addedVideos.push({
			id: added.id,
			name: added.name,
			durationSeconds: added.durationSeconds,
			width: added.width,
			height: added.height,
			media: await keep(added.file, added.file.name)
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
			audioItems.push({
				...rest,
				origin: { kind: 'file', media: await keep(origin.file, item.name) }
			})
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
	// The media and the project in one transaction: saved together once it
	// commits, or not at all, so a failed save leaves no media behind.
	const db = await open()
	try {
		const tx = db.transaction([MEDIA, PROJECTS], 'readwrite')
		const media = tx.objectStore(MEDIA)
		for (const { ref, blob } of files) {
			const kept = media.count(ref.key)
			kept.onsuccess = () => {
				if (kept.result === 0) media.put(blob, ref.key)
			}
		}
		tx.objectStore(PROJECTS).put(stored)
		await committed(tx)
	} finally {
		db.close()
	}
	void navigator.storage?.persist?.()
	return stored.savedAt
}

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
	if (!(await fileMatches(ref, file))) return false
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
