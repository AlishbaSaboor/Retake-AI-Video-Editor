'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SignInIcon, SpinnerIcon } from '@/components/ui/icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { signIn, signUp } from './actions'

type Mode = 'signIn' | 'signUp'

/** Where to go once signed in: a page of this site (`next`), else the home page. */
function destination(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/home'
}

export function LoginForm({ next, enabled }: { next: string | null; enabled: boolean }) {
	const t = useTranslations('Site.login')
	const router = useRouter()
	const [mode, setMode] = useState<Mode>('signIn')
	const [pending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)

	return (
		<div className="border-border bg-surface flex flex-col gap-6 rounded-lg border p-6 shadow-xl sm:p-8">
			<div
				role="tablist"
				aria-label={t('modes')}
				className="bg-surface-inset border-border grid grid-cols-2 gap-1 rounded-lg border p-1"
			>
				{(['signIn', 'signUp'] as const).map((option) => (
					<button
						key={option}
						type="button"
						role="tab"
						aria-selected={mode === option}
						onClick={() => {
							setMode(option)
							setError(null)
						}}
						className={cn(
							'focus-visible:outline-accent h-9 rounded-md text-sm font-medium transition-colors focus-visible:outline-2',
							mode === option ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
						)}
					>
						{t(`${option}.tab`)}
					</button>
				))}
			</div>
			<div className="flex flex-col gap-1">
				<h1 className="font-display text-text text-2xl font-bold tracking-tight">
					{t(`${mode}.title`)}
				</h1>
				<p className="text-text-muted text-sm">{t(`${mode}.description`)}</p>
			</div>
			{!enabled && (
				<p role="status" className="border-warning/40 text-warning rounded-lg border p-3 text-sm">
					{t('disabled')}
				</p>
			)}
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault()
					const form = new FormData(event.currentTarget)
					const credentials = { email: form.get('email'), password: form.get('password') }
					setError(null)
					startTransition(async () => {
						const result = await (mode === 'signIn' ? signIn : signUp)(credentials)
						if (!result.ok) {
							// A malformed email or a short password, caught by the action's schema.
							setError(result.error === 'Invalid request' ? t('invalid') : result.error)
							return
						}
						router.push(destination(next))
						router.refresh()
					})
				}}
			>
				<div className="flex flex-col gap-2">
					<Label htmlFor="login-email">{t('email')}</Label>
					<Input id="login-email" name="email" type="email" required autoComplete="email" />
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="login-password">{t('password')}</Label>
					<Input
						id="login-password"
						name="password"
						type="password"
						required
						minLength={6}
						autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
					/>
					{mode === 'signUp' && <p className="text-text-faint text-xs">{t('passwordHint')}</p>}
				</div>
				{error && (
					<p role="alert" className="text-danger text-sm">
						{error}
					</p>
				)}
				<Button type="submit" size="lg" disabled={pending || !enabled}>
					{pending ? <SpinnerIcon /> : <SignInIcon />}
					{t(`${mode}.submit`)}
				</Button>
			</form>
		</div>
	)
}
