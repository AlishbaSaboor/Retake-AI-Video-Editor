import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LockIcon, MicIcon, SparkleIcon } from '@/components/ui/icons'
import { Logo } from '@/components/site/logo'
import { authConfigured } from '@/server/auth/session'
import { LoginForm } from './login-form'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.login')
	return { title: t('metaTitle') }
}

/** Bar heights of the drawn waveform, in px; the middle stretch is the line said again. */
const WAVE = [
	13, 40, 53, 52, 41, 32, 20, 12, 11, 16, 21, 21, 20, 14, 16, 23, 32, 33, 27, 17, 9, 16, 17, 16, 14,
	11, 10, 12, 22, 32, 38, 44, 39, 22, 25, 46, 57, 51, 43, 33, 22, 17, 27, 43, 51, 48, 43, 32, 55,
	78, 93, 85, 58, 34, 37, 46, 38, 28, 20, 14, 24, 33, 19, 12
] as const
const SAID_AGAIN = { from: 27, to: 39 } as const
const POINTS = [
	{ key: 'plan', icon: SparkleIcon },
	{ key: 'rerecord', icon: MicIcon },
	{ key: 'browser', icon: LockIcon }
] as const

export default async function LoginPage({
	searchParams
}: {
	searchParams: Promise<{ next?: string | string[] }>
}) {
	const { next } = await searchParams
	const t = await getTranslations('Site.login')
	return (
		<main className="grid min-h-dvh lg:grid-cols-2">
			<div className="flex flex-col px-6 py-8 sm:px-16">
				<Logo className="self-start text-[28px] [&>span:first-child]:size-8" />
				<div className="flex flex-1 items-center justify-center py-12">
					<LoginForm next={typeof next === 'string' ? next : null} enabled={authConfigured()} />
				</div>
				<p className="text-text-faint text-[12.5px]">{t('footnote')}</p>
			</div>
			<aside
				aria-hidden
				data-theme="dark"
				className="from-night relative m-4 hidden overflow-hidden rounded-[32px] bg-linear-160 to-black px-[52px] py-12 text-white lg:flex lg:flex-col"
			>
				<span className="bg-brand-purple absolute -top-64 -left-36 size-[566px] rounded-full opacity-50 blur-[90px]" />
				<span className="bg-brand-blue absolute -right-44 -bottom-64 size-[531px] rounded-full opacity-40 blur-[90px]" />
				<span className="relative font-mono text-xs font-semibold tracking-[0.2em] text-white/60 uppercase">
					{t('pitchEyebrow')}
				</span>
				<p className="relative mt-auto font-serif text-[clamp(56px,5.3vw,76px)] leading-[0.95] tracking-[-0.015em]">
					{t.rich('pitch', {
						em: (chunks) => <em className="text-gradient block italic">{chunks}</em>
					})}
				</p>
				<div className="relative mt-12">
					<span className="absolute -top-9 left-[46%] -translate-x-1/2 rounded-full border border-white/20 bg-white/12 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
						{t('waveform')}
					</span>
					<div className="flex h-[100px] items-center gap-[3.5px]">
						{WAVE.map((height, index) => {
							const again = index >= SAID_AGAIN.from && index < SAID_AGAIN.to
							return (
								<span
									key={index}
									className={
										again
											? 'from-brand-lilac to-brand-violet w-1.5 shrink-0 rounded-[3px] bg-linear-to-b'
											: 'w-1.5 shrink-0 rounded-[3px] bg-white/22'
									}
									style={{ height }}
								/>
							)
						})}
					</div>
					<div className="mt-3 flex justify-between font-mono text-[11px] text-white/50">
						{['0:00', '0:15', '0:30', '0:45'].map((time) => (
							<span key={time}>{time}</span>
						))}
					</div>
				</div>
				<ul className="relative mt-auto flex flex-col gap-4 pt-16">
					{POINTS.map(({ key, icon: Icon }) => (
						<li key={key} className="flex items-center gap-3.5 text-[15px] text-white/90">
							<span className="flex size-8 items-center justify-center rounded-[10px] bg-white/10">
								<Icon size={15} />
							</span>
							{t(`points.${key}`)}
						</li>
					))}
				</ul>
			</aside>
		</main>
	)
}
