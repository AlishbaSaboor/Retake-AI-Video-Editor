import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CLIP_AUDIO } from './clip-audio'
import { NEUTRAL_GRADE } from './color-grade'
import { commandToPlan, type CommandContext, type EditCommand } from './edit-command'
import { fileMatches, findProject, mediaKey, type ProjectSummary } from './projects'
import { IDENTITY_TRANSFORM } from './transform'

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

test('media is kept once per file, and a picked file stands in only if it is the same one', () => {
	assert.equal(
		mediaKey({ name: 'take.mp4', size: 10, lastModified: 5 }),
		mediaKey({ name: 'take.mp4', size: 10, lastModified: 5 })
	)
	assert.notEqual(
		mediaKey({ name: 'take.mp4', size: 10, lastModified: 5 }),
		mediaKey({ name: 'take.mp4', size: 11, lastModified: 5 })
	)
	const ref = { key: 'k', name: 'take.mp4', type: 'video/mp4', size: 10 }
	assert.equal(fileMatches(ref, { name: 'take.mp4', size: 10 }), true)
	assert.equal(fileMatches(ref, { name: 'take.mp4', size: 9 }), false)
	assert.equal(fileMatches(ref, { name: 'other.mp4', size: 10 }), false)
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
	font: null
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
