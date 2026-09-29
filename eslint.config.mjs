import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

// `**`, not `*` — a single star doesn't cross a `/`, so '@phosphor-icons/*'
// would miss the very path this template itself imports
// ('@phosphor-icons/react/ssr').
const ICON_PROVIDER_IMPORTS = {
	group: [
		'@phosphor-icons/**',
		'lucide-react',
		'@heroicons/**',
		'@radix-ui/react-icons',
		'@tabler/icons-react',
		'react-icons',
		'react-icons/**'
	],
	message:
		"Import icons from '@/components/ui/icons' instead — that file is the only place an icon provider is imported. Add the icon there if it's missing. See docs/rules/icons.md."
}

// Every provider SDK, plus the wrappers that would route around one. An
// import here is an AI call that no ai_usage row will ever account for, which
// is the failure this whole subsystem exists to make impossible rather than
// merely discouraged.
const AI_SDK_IMPORTS = {
	group: [
		'@anthropic-ai/sdk',
		'@anthropic-ai/sdk/**',
		'openai',
		'openai/**',
		'@google/genai',
		'@google/genai/**',
		'@google/generative-ai',
		'ai',
		'@ai-sdk/**'
	],
	message:
		"Call the provider through 'src/server/ai/<provider>' instead — that file is the only place an AI SDK is imported, and the only place trackAiCall is called. Add the method there if it's missing. See docs/rules/ai-usage.md."
}

// Prisma is the only data path (docs/rules/database.md). The client is
// constructed once, in src/server/db/client.ts, and everything else imports
// `db` from there. Type imports stay allowed — typing a parameter as
// `AdminRole` is not a second connection. The raw drivers and other ORMs have
// no legitimate importer anywhere in src/.
const DATA_ACCESS_IMPORTS = {
	group: [
		'@prisma/client',
		'@prisma/client/**',
		'@/generated/prisma',
		'@/generated/prisma/**',
		'**/generated/prisma/**',
		'pg',
		'pg/**',
		'postgres',
		'@neondatabase/serverless',
		'drizzle-orm',
		'drizzle-orm/**',
		'kysely',
		'knex',
		'typeorm',
		'sequelize',
		'@supabase/postgrest-js'
	],
	allowTypeImports: true,
	message:
		"Import `db` from '@/server/db/client' instead — that file is the only place the Prisma client is constructed, and raw database drivers have no place in src/. See docs/rules/database.md."
}

// Supabase is auth only (docs/rules/auth.md). The wrappers in src/lib/supabase/
// hand out a client typed to its auth surface, so `.from()` and `.rpc()` are
// type errors; importing the SDK directly would be the way around that type,
// which is why it is banned everywhere else. proxy.ts is the one other holder:
// it refreshes the session cookie before any wrapper could run.
const SUPABASE_IMPORTS = {
	group: ['@supabase/supabase-js', '@supabase/ssr', '@supabase/**'],
	allowTypeImports: true,
	message:
		"Use createServerSupabaseClient / createSecretKeyClient from '@/lib/supabase/*' instead — Supabase is auth only here; application data goes through Prisma. See docs/rules/auth.md."
}

const LOGGER_IMPORTS = {
	group: ['pino', 'pino/**'],
	message:
		"Import log from '@/server/lib/logger' instead — the shared Pino wrapper owns correlation and redaction. See docs/rules/logging.md."
}

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTypescript,
	globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'src/generated/**']),
	{
		// See docs/rules/code-quality.md for the rationale behind both rules.
		rules: {
			'@typescript-eslint/no-explicit-any': 'error'
		}
	},
	{
		// no-console scoped to application code only — scripts/ is
		// operational tooling that legitimately prints to stdout.
		files: ['src/**/*.{ts,tsx}'],
		rules: { 'no-console': 'error' }
	},
	{
		// env.ts is shared with client code and must report invalid boot config
		// before a server-only logger can be imported.
		files: ['src/lib/env.ts', '**/instrumentation*.ts', 'sentry.*.config.ts'],
		rules: {
			'no-console': ['error', { allow: ['warn', 'error'] }]
		}
	},
	{
		// Icons come from '@/components/ui/icons', AI SDKs from 'src/server/ai/*',
		// the Prisma client from 'src/server/db/client.ts' and Supabase from
		// 'src/lib/supabase/*' — never from the package directly. See
		// docs/rules/icons.md, ai-usage.md, database.md and auth.md. Same
		// enforcement shape as the logger rule below: one file owns the
		// dependency, the rest of the codebase imports the wrapper.
		//
		// All pattern groups live in ONE rule entry on purpose. ESLint flat
		// config resolves a rule by last-match-wins, so a second block
		// re-declaring `no-restricted-imports` over `src/**` would silently
		// replace this one rather than add to it — which is why each exemption
		// block below re-states every group that still applies instead of only
		// subtracting its own.
		files: ['src/**/*.{ts,tsx}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						ICON_PROVIDER_IMPORTS,
						AI_SDK_IMPORTS,
						DATA_ACCESS_IMPORTS,
						SUPABASE_IMPORTS,
						LOGGER_IMPORTS
					]
				}
			]
		}
	},
	{
		files: ['src/components/ui/icons.tsx'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: [AI_SDK_IMPORTS, DATA_ACCESS_IMPORTS, SUPABASE_IMPORTS, LOGGER_IMPORTS] }
			]
		}
	},
	{
		// src/server/ai/* is where the AI SDKs are allowed to be imported, and
		// the only place trackAiCall is called. Every other ban still applies.
		files: ['src/server/ai/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: [ICON_PROVIDER_IMPORTS, DATA_ACCESS_IMPORTS, SUPABASE_IMPORTS, LOGGER_IMPORTS] }
			]
		}
	},
	{
		// The one file that constructs the Prisma client.
		files: ['src/server/db/client.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: [ICON_PROVIDER_IMPORTS, AI_SDK_IMPORTS, SUPABASE_IMPORTS, LOGGER_IMPORTS] }
			]
		}
	},
	{
		// The Supabase wrappers, and the proxy that refreshes the session before
		// any of them could run.
		files: ['src/lib/supabase/**/*.ts', 'src/proxy.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: [ICON_PROVIDER_IMPORTS, AI_SDK_IMPORTS, DATA_ACCESS_IMPORTS, LOGGER_IMPORTS] }
			]
		}
	},
	{
		files: ['src/server/lib/logger/logger.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: [ICON_PROVIDER_IMPORTS, AI_SDK_IMPORTS, DATA_ACCESS_IMPORTS, SUPABASE_IMPORTS] }
			]
		}
	},
	{
		// The logger uses node:async_hooks and process.stdout — it can't run in
		// a browser bundle. It doesn't import `server-only` (that would throw in
		// the node:test suites that exercise it), so the boundary in
		// docs/rules/logging.md is enforced here instead: a `'use client'` file
		// reports errors through Sentry (instrumentation-client.ts), never the
		// logger.
		files: ['src/**/*.{ts,tsx}'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector:
						"Program:has(> ExpressionStatement[directive='use client']) ImportDeclaration[source.value=/^@\\/server\\/lib\\/logger(\\/|$)/]",
					message:
						'The logger is server-only; a Client Component reports errors through Sentry (instrumentation-client.ts). See docs/rules/logging.md.'
				}
			]
		}
	}
])

export default eslintConfig
