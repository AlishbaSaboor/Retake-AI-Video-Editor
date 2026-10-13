import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAILY_AI_LIMITS } from './ai-limits'

// What the public copy promises has to be what the product does.

type Messages = { [key: string]: string | Messages }
const messages: Messages = JSON.parse(
	readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')
)

/** Every message under `path` (dot-separated), as [its full path, its text]. */
function under(path: string): Array<[string, string]> {
	let node: string | Messages | undefined = messages
	for (const key of path.split('.')) node = typeof node === 'object' ? node[key] : undefined
	assert.ok(node !== undefined, `no messages at ${path}`)
	const out: Array<[string, string]> = []
	const walk = (at: string, value: string | Messages) => {
		if (typeof value === 'string') out.push([at, value])
		else for (const [key, child] of Object.entries(value)) walk(`${at}.${key}`, child)
	}
	walk(path, node)
	return out
}

test('Make it brings no music while public/music holds no track, and its copy never says it does', () => {
	// The same file types Make it reads tracks from (make/actions.ts, MUSIC_FILE).
	const tracks = readdirSync(new URL('../../public/music', import.meta.url)).filter((name) =>
		/\.(mp3|m4a|ogg|opus|wav|webm)$/i.test(name)
	)
	assert.deepEqual(tracks, [], 'tracks were added: Make it can now lay music, so revisit this copy')
	const makeItCopy = [...under('Site.landing.demo'), ...under('Editor.followUp.example')]
	for (const [path, text] of makeItCopy) {
		// Music the user adds by hand on the Audio lane is true; music from Make it isn't.
		const claim = text.replace('add music of your own on the Audio lane', '')
		assert.doesNotMatch(claim, /music/i, path)
		assert.doesNotMatch(path, /music/i, path)
	}
})

test('the limit-reached message names the Make it limit as steps', () => {
	assert.equal(DAILY_AI_LIMITS.make_it.what, 'Make it steps')
})
