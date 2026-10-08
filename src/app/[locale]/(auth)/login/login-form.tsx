'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
	ArrowRightIcon,
	HideIcon,
	LockIcon,
	MailIcon,
	ShowIcon,
	SpinnerIcon
} from '@/components/ui/icons'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { signIn, signUp } from './actions'

type Mode = 'signIn' | 'signUp'

/** Where to go once signed in: a page of this site (`next`), else the home page. */
function destination(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/home'
}

const field =
	'border-border-strong bg-surface-inset text-text focus-within:border-accent/60 focus-within:ring-accent-soft flex h-[52px] items-center gap-3 rounded-[14px] border pl-3.5 transition-shadow focus-within:ring-4'

export function LoginForm({ next, enabled }: { next: string | null; enabled: boolean }) {
	const t = useTranslations('Site.login')
	const router = useRouter()
	const [mode, setMode] = useState<Mode>('signIn')
	const [showPassword, setShowPassword] = useState(false)
	const [pending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)
	const other: Mode = mode === 'signIn' ? 'signUp' : 'signIn'

	return (
		<div className="rt-rise flex w-full max-w-[400px] flex-col gap-7">
			<div className="flex flex-col gap-2">
				<h1 className="text-text font-serif text-[64px] leading-none tracking-[-0.02em]">
					{t.rich(`${mode}.title`, {
						em: (chunks) => <em className="text-gradient italic">{chunks}</em>
					})}
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
				className="flex flex-col gap-[18px]"
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
					<label htmlFor="login-email" className="text-text text-[13.5px] font-bold">
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
							className="placeholder:text-text-faint h-full min-w-0 flex-1 bg-transparent pr-3.5 text-base outline-none"
						/>
					</span>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="login-password" className="text-text text-[13.5px] font-bold">
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
							className="placeholder:text-text-faint h-full min-w-0 flex-1 bg-transparent text-base outline-none"
						/>
						<button
							type="button"
							aria-label={showPassword ? t('hidePassword') : t('showPassword')}
							aria-pressed={showPassword}
							onClick={() => setShowPassword((shown) => !shown)}
							className="text-text-muted hover:text-text hover:bg-surface-hover focus-visible:outline-accent flex size-10 items-center justify-center rounded-[10px] focus-visible:outline-2"
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
					className="rt-btn bg-brand focus-visible:outline-accent mt-2 flex h-[54px] items-center justify-center gap-2 rounded-[15px] text-base font-extrabold text-white shadow-[0_16px_40px_-16px_var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
				>
					{pending && <SpinnerIcon />}
					{t(`${mode}.submit`)}
					{!pending && <ArrowRightIcon size={17} />}
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
					className="text-accent-fg focus-visible:outline-accent rounded font-extrabold hover:underline focus-visible:outline-2"
				>
					{t(`${mode}.switchLink`)}
				</button>
			</p>
		</div>
	)
}
