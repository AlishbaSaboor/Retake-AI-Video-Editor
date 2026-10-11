import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CLIP_AUDIO } from '../model/clip-audio'
import { NEUTRAL_GRADE } from '../model/color-grade'
import { commandToPlan, type CommandContext, type EditCommand } from '../assistant/edit-command'
import { ORIGINAL_EDIT } from '../model/edit-snapshot'
import {
	deleteProject,
	fileMatches,
	findProject,
	isStorageFull,
	listProjects,
	mediaFingerprint,
	mediaKey,
	missingMedia,
	relinkMedia,
	saveProject,
	type MediaRef,
	type ProjectSummary,
	type StoredProject
} from './projects'
import { IDENTITY_TRANSFORM } from '../model/transform'

const projects: ProjectSummary[] = [
	{ id: 'a', name: 'Holiday', savedAt: 1 },
	{ id: 'b', name: 'Holiday cut 2', savedAt: 3 },
	{ id: 'c', name: 'Interview', savedAt: 2 }
]

test('a typed name finds its project: the same name first, else the latest containing it', () => {
	assert.equal(findProject(projects, ' holiday ')?.id, 'a')
	assert.equal(findProject(projects, 'cut 2')?.id, 'b')
	assert.equal(findProject(projects, 'the interview video')?.id, 'c')
	assert.equal(findProject(projects, 'wedding'), null)
	assert.equal(findProject(projects, ''), null)
})

test('media is kept once per file, and a picked file stands in only if it is the same one', async () => {
	assert.equal(
		mediaKey({ name: 'take.mp4', size: 10, lastModified: 5 }),
		mediaKey({ name: 'take.mp4', size: 10, lastModified: 5 })
	)
	assert.notEqual(
		mediaKey({ name: 'take.mp4', size: 10, lastModified: 5 }),
		mediaKey({ name: 'take.mp4', size: 11, lastModified: 5 })
	)
	const ref = { key: 'k', name: 'take.mp4', type: 'video/mp4', size: 10 }
	const file = (name: string, size: number) => new File([new Uint8Array(size)], name)
	assert.equal(await fileMatches(ref, file('take.mp4', 10)), true)
	assert.equal(await fileMatches(ref, file('take.mp4', 9)), false)
	assert.equal(await fileMatches(ref, file('other.mp4', 10)), false)
})

const NONE: Omit<EditCommand, 'action'> = {
	startSeconds: null,
	endSeconds: null,
	text: null,
	corner: null,
	fromClip: null,
	toClip: null,
	rate: null,
	region: null,
	degrees: null,
	axis: null,
	aspect: null,
	percent: null,
	seconds: null,
	property: null,
	target: null,
	color: null,
	background: null,
	font: null,
	effect: null
}
const CONTEXT: CommandContext = {
	durationSeconds: 10,
	editedSeconds: 10,
	clipCount: 1,
	canSplitAt: () => true,
	cleanupSeconds: 0,
	canUndo: true,
	canRedo: false,
	canReset: true,
	sentenceAt: () => null,
	transform: IDENTITY_TRANSFORM,
	picture: { width: 320, height: 180 },
	clipAudio: [DEFAULT_CLIP_AUDIO],
	clipTakes: [false],
	joinLimits: [0],
	colors: { video: NEUTRAL_GRADE, clips: [undefined] },
	hasTitle: false,
	textCount: 0,
	audioCount: 0,
	extractBlockers: [null],
	playheadSeconds: 0,
	canMerge: () => true,
	projectName: 'take',
	unsaved: true,
	projects
}
const run = (fields: Partial<EditCommand> & Pick<EditCommand, 'action'>, context = CONTEXT) =>
	commandToPlan({ ...NONE, ...fields }, context)

test('save and open as commands: a name or the current one; an unknown project refused', () => {
	assert.deepEqual(run({ action: 'save_project' }), {
		ok: true,
		plan: { kind: 'saveProject', name: 'take' }
	})
	assert.deepEqual(run({ action: 'save_project', text: ' Holiday v3 ' }), {
		ok: true,
		plan: { kind: 'saveProject', name: 'Holiday v3' }
	})
	// Unsaved changes to this edit: the confirmation says so.
	assert.deepEqual(run({ action: 'open_project', text: 'interview' }), {
		ok: true,
		plan: { kind: 'openProject', id: 'c', name: 'Interview', unsaved: true }
	})
	assert.deepEqual(run({ action: 'open_project', text: 'wedding' }), {
		ok: false,
		reason: 'no_such_project'
	})
	assert.deepEqual(run({ action: 'open_project', text: 'x' }, { ...CONTEXT, projects: [] }), {
		ok: false,
		reason: 'no_projects'
	})
})

// Saving and re-linking, against a real IndexedDB implementation
// (fake-indexeddb). What a real browser does when its storage is full isn't
// covered: here a write's commit is made to fail the way it can there.

/** A video file of `bytes`. */
const video = (name: string, bytes: Uint8Array, lastModified = 1) =>
	new File([bytes], name, { type: 'video/mp4', lastModified })
const bytesOf = (size: number, fill: number) => new Uint8Array(size).fill(fill)

function openRaw(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('retake', 1)
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}

/** Runs `run` on store `name` in its own transaction, once it has committed. */
async function raw<T>(
	name: string,
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await openRaw()
	try {
		return await new Promise<T>((resolve, reject) => {
			const tx = db.transaction(name, mode)
			const req = run(tx.objectStore(name))
			tx.oncomplete = () => resolve(req.result)
			tx.onabort = () => reject(tx.error)
		})
	} finally {
		db.close()
	}
}

/** What the browser holds now: every media key, and every project. */
async function stored() {
	return {
		media: await raw('media', 'readonly', (store) => store.getAllKeys()),
		projects: await raw<StoredProject[]>('projects', 'readonly', (store) => store.getAll())
	}
}

async function clear() {
	for (const { id } of await listProjects()) await deleteProject(id)
}

/**
 * Makes the next project write succeed as a request but its transaction then
 * abort, failing with `error` (as a browser does when its storage fills on
 * commit), or with no error of its own.
 */
function failNextCommit(error: DOMException | null) {
	const put = IDBObjectStore.prototype.put
	IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: [unknown, IDBValidKey?]) {
		const req = put.apply(this, args)
		if (this.name === 'projects') {
			IDBObjectStore.prototype.put = put
			const tx = this.transaction
			req.addEventListener('success', () => {
				tx.abort()
				if (error) Object.defineProperty(tx, 'error', { value: error })
			})
		}
		return req
	}
}

const save = (id: string, main: File) =>
	saveProject({ id, name: id, main, transcript: null, edit: ORIGINAL_EDIT })

test('a save is done only once it commits; a failed commit is an error and leaves no media behind', async () => {
	await clear()
	// Saved: the project and its video, the video's fingerprint with it.
	await save('kept', video('a.mp4', bytesOf(64, 1)))
	const first = await stored()
	assert.equal(first.projects.length, 1)
	assert.equal(first.media.length, 1)
	assert.match(first.projects[0]?.main.fingerprint ?? '', /^[0-9a-f]{64}$/)

	// A commit that fails: the save fails, and the new video isn't left behind.
	failNextCommit(null)
	await assert.rejects(save('lost', video('b.mp4', bytesOf(64, 2))))
	const after = await stored()
	assert.deepEqual(
		after.projects.map(({ id }) => id),
		['kept']
	)
	assert.deepEqual(after.media, first.media)
	await clear()
})

test('storage full on commit: the save fails as storage full, with its plain message, and leaves nothing', async () => {
	await clear()
	failNextCommit(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))
	const failure = await save('big', video('big.mp4', bytesOf(64, 3))).then(
		() => null,
		(error: unknown) => error
	)
	assert.equal(isStorageFull(failure), true)
	assert.deepEqual(await stored(), { media: [], projects: [] })
	// Only that error is storage full; and the editor says so in these words.
	assert.equal(isStorageFull(new DOMException('aborted', 'AbortError')), false)
	assert.equal(isStorageFull(new Error('QuotaExceededError')), false)
	const messages = JSON.parse(
		readFileSync(new URL('../../../../../messages/en.json', import.meta.url), 'utf-8')
	) as { Editor: { projects: { storageFull: string } } }
	assert.equal(
		messages.Editor.projects.storageFull,
		'Your browser’s storage is full. Delete a project or free some space, then save again.'
	)
})

test('re-linking: a file of the same name and size but other content is refused; the same file is taken', async () => {
	await clear()
	const original = bytesOf(64, 4)
	await save('p', video('take.mp4', original))
	// The browser loses the video; the project asks for it.
	const main = (await stored()).projects[0]?.main
	assert.ok(main)
	await raw('media', 'readwrite', (store) => store.delete(main.key))
	const [missing] = await missingMedia('p')
	assert.ok(missing)
	const impostor = video('take.mp4', bytesOf(64, 5))
	assert.equal(impostor.size, original.length)
	assert.equal(await relinkMedia(missing, impostor), false)
	// The same content, picked again (a new File, another date): taken.
	assert.equal(await relinkMedia(missing, video('take.mp4', original, 99)), true)
	assert.deepEqual(await missingMedia('p'), [])
	await clear()
})

test('a fingerprint reads both ends: files differing only in their last byte, or first, differ', async () => {
	const size = 3 * 1024 * 1024
	const base = bytesOf(size, 6)
	const lastChanged = base.slice()
	lastChanged[size - 1] = 7
	const firstChanged = base.slice()
	firstChanged[0] = 7
	const print = (bytes: Uint8Array) => mediaFingerprint(new Blob([bytes]))
	assert.equal(await print(base), await print(base.slice()))
	assert.notEqual(await print(base), await print(lastChanged))
	assert.notEqual(await print(base), await print(firstChanged))
})

test("a project saved before fingerprints still re-links on its file's name and size", async () => {
	await clear()
	// As an older version stored it: a media reference with no fingerprint.
	await save('old', video('old.mp4', bytesOf(64, 8)))
	const project = (await stored()).projects[0]
	assert.ok(project)
	const legacy: MediaRef = {
		key: project.main.key,
		name: project.main.name,
		type: project.main.type,
		size: project.main.size
	}
	await raw('projects', 'readwrite', (store) => store.put({ ...project, main: legacy }))
	await raw('media', 'readwrite', (store) => store.delete(legacy.key))
	const [missing] = await missingMedia('old')
	assert.ok(missing)
	assert.equal(missing.fingerprint, undefined)
	assert.equal(await relinkMedia(missing, video('old.mp4', bytesOf(64, 9))), true)
	assert.deepEqual(await missingMedia('old'), [])
	await clear()
})
