import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { DisplayHeading, Eyebrow, emphasis } from '@/components/site/display'
import { Link } from '@/i18n/routing'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.privacy')
	return { title: t('metaTitle') }
}

/** Each section, and how many lines it has. */
const SECTIONS = [
	{ key: 'who', lines: 1 },
	{ key: 'collect', lines: 4 },
	{ key: 'use', lines: 1 },
	{ key: 'ai', lines: 3 },
	{ key: 'keep', lines: 1 },
	{ key: 'choices', lines: 1 },
	{ key: 'changes', lines: 1 }
] as const

const bold = (chunks: React.ReactNode) => <strong className="text-text font-bold">{chunks}</strong>

/** The privacy policy, in plain words. */
export default async function PrivacyPage() {
	const t = await getTranslations('Site.privacy')
	return (
		<main className="px-[clamp(16px,4vw,48px)] pt-[clamp(70px,11vw,150px)]">
			<div className="mx-auto flex max-w-[760px] flex-col">
				<div className="rt-rise flex flex-col items-start gap-[22px]">
					<Eyebrow>{t('eyebrow')}</Eyebrow>
					<DisplayHeading as="h1" size="page">
						{t.rich('title', { em: emphasis('plain') })}
					</DisplayHeading>
					<p className="text-text-faint text-sm">{t('updated')}</p>
					<p className="text-text-muted mt-3 text-lg leading-[1.6]">{t('description')}</p>
				</div>
				<div className="border-border mt-12 border-t">
					{SECTIONS.map(({ key, lines }) => (
						<section
							key={key}
							aria-labelledby={`privacy-${key}`}
							className="border-border grid gap-3 border-b py-8 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8"
						>
							<h2 id={`privacy-${key}`} className="text-text text-[17px] font-extrabold">
								{t(`sections.${key}.title`)}
							</h2>
							<div className="text-text-muted flex flex-col gap-3 text-base leading-[1.7]">
								{Array.from({ length: lines }, (_, line) => (
									<p key={line}>{t.rich(`sections.${key}.items.${line}`, { b: bold })}</p>
								))}
							</div>
						</section>
					))}
				</div>
				<p className="text-text-muted mt-10 text-base">
					{t.rich('questions', {
						link: (chunks) => (
							<Link
								href="/contact"
								className="text-accent-fg font-bold underline-offset-4 hover:underline"
							>
								{chunks}
							</Link>
						)
					})}
				</p>
			</div>
		</main>
	)
}
