import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

// Deepgram is called with fetch, not an SDK, so the AI-SDK import ban can't
// see a second call to it. This lints code with the repo's own config.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const eslint = new ESLint({ cwd: REPO_ROOT })
const DEEPGRAM = /Call Deepgram through 'src\/server\/ai\/deepgram'/
const LOGGER = /The logger is server-only/

async function messages(code, filePath) {
	const [result] = await eslint.lintText(code, { filePath })
	return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax')
}

const RAW_CALLS = [
	"export const listen = () => fetch('https://api.deepgram.com/v1/listen', { method: 'POST' })\n",
	'export const listen = (model: string) => fetch(`https://api.deepgram.com/v1/listen?model=${model}`)\n',
	"export const HOST = 'API.DEEPGRAM.COM'\n"
]

test('a call to Deepgram outside src/server/ai fails lint', async () => {
	for (const filePath of [
		'src/app/[locale]/editor/actions.ts',
		'src/server/lib/transcribe.ts',
		'src/components/site/x.tsx'
	]) {
		for (const code of RAW_CALLS) {
			const found = await messages(code, filePath)
			assert.ok(
				found.some((message) => DEEPGRAM.test(message.message)),
				`${filePath}: ${code}`
			)
		}
	}
})

test('the Deepgram wrapper may call it, and still may not put the logger in a client file', async () => {
	for (const code of RAW_CALLS) {
		assert.deepEqual(await messages(code, 'src/server/ai/deepgram.ts'), [], code)
	}
	const clientLogger = "'use client'\nimport { log } from '@/server/lib/logger'\nlog.info('x')\n"
	for (const filePath of ['src/server/ai/deepgram.ts', 'src/app/x.tsx']) {
		const found = await messages(clientLogger, filePath)
		assert.ok(
			found.some((message) => LOGGER.test(message.message)),
			filePath
		)
	}
})
