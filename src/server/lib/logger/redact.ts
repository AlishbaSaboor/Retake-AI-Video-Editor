const REDACTED = '[redacted]'
const CIRCULAR = '[circular]'
const TRUNCATED = '[truncated]'
const MAX_DEPTH = 8

const SENSITIVE_WORDS = new Set([
	'authorization',
	'cookie',
	'credential',
	'credentials',
	'key',
	'passphrase',
	'passwd',
	'password',
	'pwd',
	'secret',
	'signature',
	'token'
])

// camelCase, snake_case and kebab-case all reduce to the same words, so
// `STRIPE_API_KEY`, `apiKey` and `x-api-key` are one rule, and `monkey`
// is not a match.
function words(name: string): string[] {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.map((word) => word.toLowerCase())
}

export function isSensitiveKey(name: string): boolean {
	return words(name).some((word) => SENSITIVE_WORDS.has(word))
}

const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/gi
const SENSITIVE_PARAM =
	/(^|[?&;\s])([\w.-]*(?:key|token|secret|password|passwd|pwd|auth|credential|signature)[\w.-]*=)([^&;\s]+)/gi
const AUTH_SCHEME = /\b(bearer|basic)\s+[\w.~+/=-]+/gi
// The alphabetic final label is what keeps `foo@1.2.3` and `app@2.0\bin` out.
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g

// A URL is the value most likely to carry a credential without a key name to
// catch it on — a DATABASE_URL password, a `?api_key=` a vendor requires in
// the query string, an Authorization header captured whole. Contact addresses
// arrive the same way, buried in a vendor's error text.
export function scrubString(value: string): string {
	return (
		value
			.replace(URL_CREDENTIALS, `$1$2:${REDACTED}@`)
			.replace(SENSITIVE_PARAM, `$1$2${REDACTED}`)
			.replace(AUTH_SCHEME, `$1 ${REDACTED}`)
			// Last, so the credential rules see userinfo before it looks like a
			// local part. The domain is kept: it is the half worth debugging.
			.replace(EMAIL, '$1***@$2')
	)
}

function isPlainObject(value: object): boolean {
	const prototype = Object.getPrototypeOf(value) as object | null
	return prototype === Object.prototype || prototype === null
}

function walk(value: unknown, seen: WeakSet<object>, depth: number): unknown {
	if (typeof value === 'string') return scrubString(value)
	if (value == null || typeof value !== 'object') return value
	if (seen.has(value)) return CIRCULAR
	if (depth >= MAX_DEPTH) return TRUNCATED
	if (!Array.isArray(value) && !isPlainObject(value)) return value

	seen.add(value)
	try {
		if (Array.isArray(value)) return value.map((item) => walk(item, seen, depth + 1))
		const scrubbed: Record<string, unknown> = {}
		for (const [name, item] of Object.entries(value)) {
			scrubbed[name] = isSensitiveKey(name) ? REDACTED : walk(item, seen, depth + 1)
		}
		return scrubbed
	} finally {
		// Dropped on the way out so a value referenced twice in one payload is
		// reported once each, not once and then as a cycle.
		seen.delete(value)
	}
}

// Defense in depth for the logger: even a field a caller forgot was sensitive
// (a whole request object, a connection string in an error message) is scrubbed
// by key name and by value before it reaches the drain. See docs/rules/logging.md.
export function redact(value: unknown): unknown {
	return walk(value, new WeakSet(), 0)
}
