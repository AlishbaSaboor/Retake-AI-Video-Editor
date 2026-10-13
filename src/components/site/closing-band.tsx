import { getTranslations } from 'next-intl/server'
import { ArrowRightIcon } from '@/components/ui/icons'
import { Link } from '@/i18n/routing'
import { emphasis, Lead } from './display'

/**
 * The end of each public page: the last line, the way in, and the outlined
 * "Retake" wordmark sliding sideways as it scrolls by (a scroll-driven CSS
 * animation; still where that isn't supported, or with reduced motion).
 */
export async function ClosingBand() {
	const t = await getTranslations('Site.closing')
	return (
		<section
			aria-labelledby="closing"
			className="mx-auto w-full max-w-[1240px] overflow-x-clip px-[clamp(16px,4vw,48px)] pt-[clamp(60px,8vw,110px)] pb-10 text-center"
		>
			<h2
				id="closing"
				className="rt-reveal font-display mx-auto max-w-[15ch] text-[clamp(40px,6.2vw,96px)] leading-[0.98] font-medium tracking-[-0.035em]"
			>
				{t.rich('title', { em: emphasis('plain') })}
			</h2>
			<Lead className="mx-auto mt-5">{t('body')}</Lead>
			<Link
				href="/home"
				className="rt-btn bg-accent text-accent-ink focus-visible:outline-accent mt-8 inline-flex min-h-[52px] items-center gap-2.5 rounded-full px-6 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
			>
				{t('start')}
				<ArrowRightIcon size={18} />
			</Link>
			<p
				aria-hidden
				className="rt-wordmark font-display mt-20 text-center text-[clamp(90px,24vw,360px)] leading-[0.8] font-bold tracking-[-0.06em] whitespace-nowrap text-transparent select-none [-webkit-text-stroke:1px_var(--border-strong)]"
			>
				Retake
			</p>
		</section>
	)
}
