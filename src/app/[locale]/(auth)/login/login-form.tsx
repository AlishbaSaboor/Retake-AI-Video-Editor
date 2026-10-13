'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { HideIcon, LockIcon, MailIcon, ShowIcon, SpinnerIcon } from '@/components/ui/icons'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { signIn, signUp } from './actions'
import { safeNext } from './next-path'

type Mode = 'signIn' | 'signUp'

const field =
	'border-border-strong bg-surface text-text-faint focus-within:border-accent focus-within:ring-accent-soft flex h-[50px] items-center gap-2.5 rounded border pl-3.5 transition-shadow focus-within:ring-4'

export function LoginForm({ next, enabled }: { next: string | null; enabled: boolean }) {
	const t = useTranslations('Site.login')
	const router = useRouter()
	const [mode, setMode] = useState<Mode>('signIn')
	const [showPassword, setShowPassword] = useState(false)
	const [pending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)
	const other: Mode = mode === 'signIn' ? 'signUp' : 'signIn'

	return (
		<div className="rt-rise flex w-full max-w-[380px] flex-col gap-[22px]">
			<div className="flex flex-col gap-3">
				<h1 className="text-text text-[clamp(40px,4.4vw,60px)] leading-[1.02] tracking-[-0.03em]">
					{t.rich(`${mode}.title`, { em: (chunks) => <em className="not-italic">{chunks}</em> })}
				</h1>
				<p className="text-text-muted">{t(`${mode}.description`)}</p>
			</div>
			{!enabled && (
				<p role="status" className="border-warning/40 text-warning rounded-xl border p-3 text-sm">
					{t('disabled')}
				</p>
			)}
			<form
				aria-label={t(`${mode}.heading`)}
				className="flex flex-col gap-[22px]"
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
						router.push(safeNext(next, window.location.origin))
						router.refresh()
					})
				}}
			>
				<div className="flex flex-col gap-2">
					<label htmlFor="login-email" className="text-text text-[13.5px] font-semibold">
						{t('email')}
					</label>
					<span className={field}>
						<MailIcon size={17} className="text-text-faint shrink-0" />
						<input
							id="login-email"
							name="email"
							type="email"
							required
							autoComplete="email"
							placeholder={t('emailPlaceholder')}
							className="placeholder:text-text-faint text-text h-full min-w-0 flex-1 bg-transparent pr-3.5 text-[15.5px] outline-none"
						/>
					</span>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="login-password" className="text-text text-[13.5px] font-semibold">
						{t('password')}
					</label>
					<span className={cn(field, 'pr-1.5')}>
						<LockIcon size={17} className="text-text-faint shrink-0" />
						<input
							id="login-password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							required
							minLength={6}
							autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
							placeholder={t('passwordPlaceholder')}
							className="placeholder:text-text-faint text-text h-full min-w-0 flex-1 bg-transparent text-[15.5px] outline-none"
						/>
						<button
							type="button"
							aria-label={showPassword ? t('hidePassword') : t('showPassword')}
							aria-pressed={showPassword}
							onClick={() => setShowPassword((shown) => !shown)}
							className="text-text-muted hover:text-text hover:bg-border focus-visible:outline-accent flex size-[38px] items-center justify-center rounded-[10px] focus-visible:outline-2"
						>
							{showPassword ? <HideIcon size={18} /> : <ShowIcon size={18} />}
						</button>
					</span>
					{mode === 'signUp' && <p className="text-text-faint text-xs">{t('passwordHint')}</p>}
				</div>
				{error && (
					<p role="alert" className="text-danger text-sm">
						{error}
					</p>
				)}
				<button
					type="submit"
					disabled={pending || !enabled}
					className="rt-btn bg-accent text-accent-ink focus-visible:outline-accent mt-1 flex min-h-[52px] items-center justify-center gap-2 rounded text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
				>
					{pending && <SpinnerIcon />}
					{t(`${mode}.submit`)}
				</button>
			</form>
			<p className="text-text-muted text-center text-[14.5px]">
				{t(`${mode}.switch`)}{' '}
				<button
					type="button"
					onClick={() => {
						setMode(other)
						setError(null)
					}}
					className="text-accent-fg focus-visible:outline-accent rounded font-semibold hover:underline focus-visible:outline-2"
				>
					{t(`${mode}.switchLink`)}
				</button>
			</p>
		</div>
	)
}
