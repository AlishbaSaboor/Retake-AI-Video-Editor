import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { emphasis } from './display'

/**
 * The band that closes each public page: "Your next video starts here." on
 * a night sky with a violet and a blue glow, and the way in. Dark in both
 * themes, as in the design.
 */
export async function ClosingBand() {
	const t = await getTranslations('Site.closing')
	return (
		<section
			aria-labelledby="closing"
			className="rt-reveal bg-night relative mx-3 mt-24 overflow-hidden rounded-[40px] bg-[radial-gradient(70%_90%_at_50%_120%,rgb(109_91_255/0.9),transparent_70%)] px-6 py-[clamp(96px,10vw,150px)] text-center text-white sm:mx-16"
		>
			<span
				aria-hidden
				className="bg-brand-purple absolute -top-52 -left-48 size-[795px] rounded-full opacity-50 blur-[90px]"
			/>
			<span
				aria-hidden
				className="bg-brand-blue absolute top-[120px] -right-52 size-[753px] rounded-full opacity-55 blur-[90px]"
			/>
			<span
				aria-hidden
				className="absolute inset-0 bg-[radial-gradient(rgb(5_6_12/0.55)_0%,rgb(5_6_12/0.15)_70%)]"
			/>
			<div className="relative mx-auto flex max-w-[820px] flex-col items-center gap-6">
				<h2
					id="closing"
					className="font-serif text-[clamp(52px,7vw,100.8px)] leading-[0.95] tracking-[-0.02em] text-balance"
				>
					{t.rich('title', { em: emphasis('plain') })}
				</h2>
				<p className="max-w-[480px] text-lg leading-[1.6] text-white/88">{t('body')}</p>
				<Link
					href="/home"
					className="rt-btn focus-visible:outline-accent text-ink mt-2 inline-flex h-[58px] items-center rounded-full bg-white px-[30px] text-base font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
				>
					{t('start')}
				</Link>
			</div>
		</section>
	)
}
