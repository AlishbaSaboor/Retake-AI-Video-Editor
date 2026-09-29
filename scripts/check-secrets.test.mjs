import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanText } from './check-secrets.mjs'

// Every rule id scanText fires on a piece of text. This whole file is on the
// scanner's SKIP_PATHS list, so the example secrets below never trip
// `check:secrets --all` against the repo itself.
function ids(text) {
	return scanText(text).map((finding) => finding.ruleId)
}

function flags(text) {
	return scanText(text).length > 0
}

test('flags a connection string with a real inline password', () => {
	const url = 'postgresql://prod_user:Xk9vQ2mZr7SdF3pLw8bN@db.abcdefgh.supabase.co:5432/postgres'
	assert.ok(ids(`DATABASE_URL="${url}"`).includes('url-credentials'))
})

test('ignores a connection string whose password is a placeholder', () => {
	for (const url of [
		'postgresql://user:password@host:6543/postgres',
		'postgresql://postgres:postgres@localhost:5432/postgres',
		'postgresql://placeholder:placeholder@localhost:5432/placeholder',
		'postgresql://user:s3cr3t@db.example.com:5432/postgres'
	]) {
		assert.equal(flags(url), false, url)
	}
})

test('flags provider-format keys', () => {
	assert.ok(ids('AKIAIOSFODNN7EXAMPLE').includes('aws-access-key-id'))
	assert.ok(ids('ghp_' + 'a'.repeat(36) + '9').includes('github-token'))
	assert.ok(ids('xoxb-123456789012-abcdefghijkl').includes('slack-token'))
	assert.ok(ids('AIza' + 'b'.repeat(35)).includes('google-api-key'))
	assert.ok(ids('sk-ant-' + 'c'.repeat(40)).includes('openai-anthropic-key'))
})

test('flags a PEM private-key header', () => {
	assert.ok(ids('-----BEGIN OPENSSH PRIVATE KEY-----').includes('private-key'))
})

test('flags a JWT such as a legacy Supabase service-role key', () => {
	const jwt =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc123def456ghi789jkl012mno345pqr678'
	assert.ok(ids(`SUPABASE_SERVICE_ROLE_KEY=${jwt}`).includes('jwt'))
})

test('flags a Supabase sb_secret_ key but not the public sb_publishable_ key', () => {
	assert.ok(
		ids('SUPABASE_SECRET_KEY=sb_secret_Xk9vQ2mZr7SdF3pLw8bNqA1cE5hJ').includes(
			'supabase-secret-key'
		)
	)
	assert.equal(
		flags('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_2UKBETne05Ty4D5otSqBqw_l5imAkfv'),
		false
	)
	assert.equal(flags('SUPABASE_SECRET_KEY=sb_secret_<your-key>'), false)
})

test('flags a high-entropy Bearer token but not a placeholder or env reference', () => {
	const real = 'Authorization: Bearer 8Fq2Xy9KpQ7mNvR2tLwE5sHfGjD8cU1o'
	assert.ok(ids(real).includes('auth-header'))
	assert.equal(flags('Authorization: Bearer sk-or-not-a-real-key'), false)
	assert.equal(flags('Authorization: Bearer $CRON_SECRET'), false)
})

test('flags a secret-shaped value on a credential-named key, base64 or hex', () => {
	assert.ok(ids('API_KEY=aB3xYz9KpQ7mNvR2tLwE5sHfGjD8cU1oZ4iX6yA').includes('sensitive-assignment'))
	assert.ok(
		ids('MY_CUSTOM_TOKEN=9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1908').includes('sensitive-assignment')
	)
})

test('does not fire the assignment rule on non-credential keys or ordinary code', () => {
	// A 40-char git SHA on a non-credential key.
	assert.equal(flags('GITHUB_SHA=9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1908'), false)
	// A per-request HMAC signature is derived, not a reusable credential.
	assert.equal(
		flags('x-moad-signature: 1788517056488.VMLQiJtI7kwwhrrbYRRB5ipRyaPsjHIgLLzYzSgFWQQ'),
		false
	)
	// Ordinary source: a schema declaration and a property reference.
	assert.equal(flags('const secret = z.string().min(1)'), false)
	assert.equal(flags('const apiKey = opts.apiKey'), false)
	// An empty or clearly-templated value.
	assert.equal(flags('SUPABASE_SERVICE_ROLE_KEY=""'), false)
	assert.equal(flags('API_KEY=${OPENAI_API_KEY}'), false)
})

test('an inline `allowlist secret` comment suppresses the line', () => {
	const line = 'API_KEY=aB3xYz9KpQ7mNvR2tLwE5sHfGjD8cU1oZ4iX6yA // allowlist secret'
	assert.equal(flags(line), false)
})

test('reports the same secret once even when two rules match it', () => {
	// A service-role JWT is both a `jwt` and a credential assignment; dedup by
	// masked value keeps one finding per secret.
	const jwt =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc123def456ghi789jkl012mno345pqr678'
	const found = scanText(`SERVICE_ROLE_KEY=${jwt}`)
	assert.equal(found.length, 1)
	assert.equal(found[0].ruleId, 'jwt')
})
