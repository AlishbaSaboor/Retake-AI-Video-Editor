import type { ReactNode } from 'react'

// Shared shell for every "something went wrong" screen (error.tsx,
// not-found.tsx) so the copy/actions differ but the layout, spacing, and
// tone don't drift between them. global-error.tsx can't use this — it may
// render before globals.css loads, so it duplicates a minimal inline-styled
// version instead (see the comment there). Never render error.message or
// a raw error object here — only copy written for the person reading it
// (see docs/rules/error-handling.md).
export function ErrorPage({
	title,
	description,
	digest,
	action
}: {
	title: string
	description: string
	digest?: string
	action?: ReactNode
}) {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
			<div className="border-border bg-surface flex max-w-md flex-col items-center gap-4 rounded-lg border p-8 shadow-sm">
				<h1 className="text-text text-lg font-semibold">{title}</h1>
				<p className="text-text-muted text-sm">{description}</p>
				{action}
				{digest && (
					<p className="text-text-faint text-xs">
						Reference: <code>{digest}</code>
					</p>
				)}
			</div>
		</div>
	)
}

// The one button style every error/not-found screen uses — kept here
// instead of a full cva variant set since there's only ever one visual
// state on these pages (see docs/rules/code-style.md, cva is for 2+
// variants).
export const errorPageActionClassName =
	'rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'
