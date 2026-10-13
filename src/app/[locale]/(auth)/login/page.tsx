import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CheckIcon } from '@/components/ui/icons'
import { Logo } from '@/components/site/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { authConfigured } from '@/server/auth/session'
import { LoginForm } from './login-form'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.login')
	return { title: t('metaTitle') }
}

/** The landing page's word rows that drift behind the panel, and which way each goes. */
const RIVER = [
	{ row: 0, top: '6%', back: false },
	{ row: 1, top: '22%', back: true },
	{ row: 3, top: '38%', back: false }
] as const
const POINTS = ['plan', 'rerecord', 'undo'] as const

export default async function LoginPage({
	searchParams
}: {
	searchParams: Promise<{ next?: string | string[] }>
}) {
	const { next } = await searchParams
	const t = await getTranslations('Site.login')
	const landing = await getTranslations('Site.landingPage')
	return (
		<main className="relative grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
			<ThemeToggle className="absolute top-6 right-7 z-10" />
			<div className="flex flex-col px-[clamp(20px,5vw,64px)] py-7">
				<Logo className="self-start" />
				<div className="flex flex-1 items-center justify-center py-10">
					<LoginForm next={typeof next === 'string' ? next : null} enabled={authConfigured()} />
				</div>
				<p className="text-text-faint text-[13px]">{t('footnote')}</p>
			</div>
			<aside aria-hidden className="hidden p-3.5 lg:flex">
				<div className="border-border bg-surface relative flex flex-1 flex-col justify-end overflow-hidden rounded-3xl border p-[clamp(24px,4vw,52px)]">
					<div className="pointer-events-none absolute inset-0 overflow-hidden mask-[linear-gradient(#000_40%,transparent_85%)]">
						{RIVER.map(({ row, top, back }) => (
							<div
								key={row}
								style={{ top }}
								className={`${back ? 'rt-drift-back' : 'rt-drift'} font-display absolute left-0 text-[clamp(34px,4.6vw,64px)] font-light tracking-[-0.03em] whitespace-nowrap text-(--river)`}
							>
								{[0, 1].map((copy) => (
									<span key={copy}>
										{landing.rich(`river.${row}`, {
											cut: (chunks) => (
												<i className="text-(--river-cut) not-italic line-through">{chunks}</i>
											)
										})}
									</span>
								))}
							</div>
						))}
					</div>
					<h2 className="relative max-w-[14ch] text-[clamp(30px,3.4vw,48px)] leading-[1.02] tracking-[-0.03em]">
						{t('panel.title')}
					</h2>
					<p className="border-border-strong text-text-faint font-display relative mt-[22px] border-t pt-4 text-[clamp(18px,1.8vw,24px)]">
						{t('panel.before')}{' '}
						<span className="rt-snip inline-block max-w-[2.6em] overflow-hidden rounded-[5px] align-bottom whitespace-nowrap">
							<span className="px-[0.12em]">{t('panel.filler')}</span>
						</span>{' '}
						{t('panel.after')}
					</p>
					<ul className="text-text-muted relative mt-[22px] flex flex-col gap-2.5 text-[14.5px]">
						{POINTS.map((key) => (
							<li key={key} className="flex items-start gap-2.5">
								<span className="text-accent-fg mt-0.5">
									<CheckIcon size={18} />
								</span>
								{t(`panel.points.${key}`)}
							</li>
						))}
					</ul>
				</div>
			</aside>
		</main>
	)
}
