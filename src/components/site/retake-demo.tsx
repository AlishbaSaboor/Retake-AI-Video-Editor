import { getTranslations } from 'next-intl/server'
import { MicIcon } from '@/components/ui/icons'

// Bar heights for the drawn sound, in px; the new take's bars are the accent.
const WAVE = [6, 10, 7, 12, 8, 14, 9, 6, 11, 13, 8, 10, 15, 12, 9, 14, 11, 7, 10, 6, 9, 12, 7, 5]
const TAKE = { from: 9, to: 17 }

/**
 * A drawing of re-recording one sentence: the transcript with the flawed
 * line struck out and its new take under it, and the sound with the new
 * take in place. Decorative.
 */
export async function RetakeDemo() {
	const t = await getTranslations('Site.landing.demo')
	return (
		<div
			aria-hidden
			className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-5 shadow-xl"
		>
			<div className="flex flex-col gap-3 text-sm">
				<p className="flex gap-3">
					<span className="text-text-faint font-mono text-xs leading-5">0:08</span>
					<span className="text-text-muted">{t('before')}</span>
				</p>
				<p className="flex gap-3">
					<span className="text-text-faint font-mono text-xs leading-5">0:12</span>
					<span className="text-text-faint line-through">{t('flawed')}</span>
				</p>
				<div className="border-accent/40 bg-accent-soft ml-9 flex flex-col gap-1 rounded-md border px-3 py-2">
					<span className="text-accent flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
						<MicIcon size={12} />
						{t('newTake')}
					</span>
					<span className="text-text">{t('fixed')}</span>
				</div>
				<p className="flex gap-3">
					<span className="text-text-faint font-mono text-xs leading-5">0:16</span>
					<span className="text-text-muted">{t('after')}</span>
				</p>
			</div>
			<div className="flex h-10 items-center gap-1">
				{WAVE.map((height, index) => (
					<span
						key={index}
						className={
							index >= TAKE.from && index < TAKE.to
								? 'bg-accent w-full rounded-sm'
								: 'bg-border-strong w-full rounded-sm'
						}
						style={{ height }}
					/>
				))}
			</div>
		</div>
	)
}
