'use client'

import { useEffect } from 'react'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/errors/chunk-load-error'
import { ErrorPage, errorPageActionClassName } from '@/components/error-page'

// Route-level boundary — Next renders this for any error thrown while
// rendering a page/layout under [locale]. `error` here is NOT necessarily
// an AppError even if one was thrown server-side: Next strips custom
// properties off errors crossing the server→client boundary in production,
// leaving only `message`/`digest`. That's why this shows one generic,
// friendly message rather than trying to surface a specific one — for a
// per-error user-facing message, handle it where the error is still a real
// object (a Server Action's return value, an API route's JSON body), not
// here. See docs/rules/error-handling.md.
export default function Error({
	error,
	reset
}: {
	error: Error & { digest?: string }
	reset: () => void
}) {
	useEffect(() => {
		if (isChunkLoadError(error)) {
			reloadOnceForChunkError()
			return
		}
		captureClientError(error, { digest: error.digest })
	}, [error])

	if (isChunkLoadError(error)) return null

	return (
		<ErrorPage
			title="Something went wrong"
			description="We hit a snag loading this page. We've been notified — try again in a moment."
			digest={error.digest}
			action={
				<button onClick={reset} className={errorPageActionClassName}>
					Try again
				</button>
			}
		/>
	)
}
