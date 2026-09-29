'use client'

import { useEffect } from 'react'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/errors/chunk-load-error'

// Replaces the ENTIRE app (including the [locale] root layout) when an
// error escapes even that layout, so it must render its own <html>/<body>
// and can't rely on globals.css having loaded — hence the inline styles and
// hardcoded colors below instead of Tailwind classes/design tokens. This is
// the one deliberate exception to "no hardcoded hex" in DESIGN.md; every
// other error UI goes through src/components/error-page.tsx and the real
// tokens. Values here are copied from the light-mode tokens in
// src/app/globals.css — keep them in sync if those change.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
	useEffect(() => {
		if (isChunkLoadError(error)) {
			reloadOnceForChunkError()
			return
		}
		captureClientError(error, { digest: error.digest, boundary: 'global-error' })
	}, [error])

	if (isChunkLoadError(error)) return null

	return (
		<html>
			<body
				style={{ margin: 0, fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif' }}
			>
				<div
					style={{
						display: 'flex',
						minHeight: '100vh',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: '1rem',
						padding: '1.5rem',
						textAlign: 'center'
					}}
				>
					<div
						style={{
							display: 'flex',
							maxWidth: '28rem',
							flexDirection: 'column',
							alignItems: 'center',
							gap: '1rem',
							borderRadius: '16px',
							border: '1px solid #e5e7eb',
							padding: '2rem'
						}}
					>
						<h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: '#16181d' }}>
							Something went wrong
						</h1>
						<p style={{ fontSize: '0.875rem', color: '#5b6472', margin: 0 }}>
							We hit a snag loading the app. We&apos;ve been notified — reloading usually fixes it.
						</p>
						<button
							onClick={() => window.location.reload()}
							style={{
								borderRadius: '8px',
								backgroundColor: '#2454b8',
								color: '#ffffff',
								padding: '0.5rem 1rem',
								fontSize: '0.875rem',
								fontWeight: 500,
								border: 'none',
								cursor: 'pointer'
							}}
						>
							Reload
						</button>
						{error.digest && (
							<p style={{ fontSize: '0.75rem', color: '#8891a0', margin: 0 }}>
								Reference: <code>{error.digest}</code>
							</p>
						)}
					</div>
				</div>
			</body>
		</html>
	)
}
