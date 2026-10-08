import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ClosingBand } from '@/components/site/closing-band'
import { PageHero, emphasis } from '@/components/site/display'
import { PathSwitcher } from '@/components/site/path-switcher'
import { ZoomShot, type ShotName } from '@/components/site/shot'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.howItWorks')
	return { title: t('metaTitle') }
}

/** Each path's steps, and which of its pictures goes with each. */
const AI_STEPS = [
	{ id: 'upload', screen: 0 },
	{ id: 'describe', screen: 0 },
	{ id: 'review', screen: 0 },
	{ id: 'apply', screen: 1 },
	{ id: 'export', screen: 1 }
] as const
const HAND_STEPS = [
	{ id: 'upload', screen: 0 },
	{ id: 'tidy', screen: 1 },
	{ id: 'shape', screen: 0 },
	{ id: 'polish', screen: 2 },
	{ id: 'export', screen: 2 }
] as const

/** How it works: two paths, with AI or by hand, step by step. */
export default async function HowItWorksPage() {
	const t = await getTranslations('Site.howItWorks')
	const shots = await getTranslations('Site.shots')
	/** A path's device screens: the real screen each of its steps describes. */
	const screens = (names: ShotName[]) =>
		names.map((name) => (
			<ZoomShot
				key={name}
				name={name}
				alt={shots(name)}
				label={shots('zoom')}
				className="overflow-hidden rounded-[18px]"
			/>
		))
	const steps = (path: 'ai' | 'hand', list: typeof AI_STEPS | typeof HAND_STEPS) =>
		list.map(({ id, screen }) => ({
			id: `${path}-${id}`,
			screen,
			label: t(`${path}.${id}.label` as 'ai.upload.label'),
			title: t(`${path}.${id}.title` as 'ai.upload.title'),
			body: t(`${path}.${id}.body` as 'ai.upload.body')
		}))
	return (
		<main>
			<PageHero eyebrow={t('eyebrow')} title={t.rich('title', { em: emphasis('accent') })} />
			<div className="mx-auto max-w-[1160px] px-5 xl:px-0">
				<PathSwitcher
					label={t('paths')}
					stepsLabel={t('stepsLabel')}
					paths={[
						{
							id: 'ai',
							name: t('pathNames.ai'),
							steps: steps('ai', AI_STEPS),
							screens: screens(['plan', 'studio'])
						},
						{
							id: 'hand',
							name: t('pathNames.hand'),
							steps: steps('hand', HAND_STEPS),
							screens: screens(['manual', 'tidy', 'yours'])
						}
					]}
				/>
			</div>
			<ClosingBand />
		</main>
	)
}
