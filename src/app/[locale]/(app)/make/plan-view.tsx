'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
	AlertIcon,
	CaptionsIcon,
	CropIcon,
	MusicIcon,
	TextIcon,
	TimingIcon,
	VideoIcon,
	CheckIcon
} from '@/components/ui/icons'
import { formatTimecode } from '@/app/[locale]/editor/model/timeline-scale'
import { cn } from '@/lib/cn'
import type { BriefPart, MakeSummary } from './make-plan'

const SECONDS_PER_MINUTE = 60
/** How much of the opening line the plan quotes. */
const OPENER_WORDS = 10

/** The first `count` words of `text`, with an ellipsis when there were more. */
function firstWords(text: string, count: number): string {
	const words = text.split(/\s+/)
	return words.length > count ? `${words.slice(0, count).join(' ')}…` : text
}

/** The plan card's rows, in the mockup's order, each with its icon. */
type PlanRow = 'length' | 'shape' | 'captions' | 'screen' | 'motion' | 'music'
const PLAN_ROWS: { key: PlanRow; icon: (props: { size?: number }) => React.ReactNode }[] = [
	{ key: 'length', icon: TimingIcon },
	{ key: 'shape', icon: CropIcon },
	{ key: 'captions', icon: CaptionsIcon },
	{ key: 'screen', icon: TextIcon },
	{ key: 'motion', icon: VideoIcon },
	{ key: 'music', icon: MusicIcon }
]

/** The plan in plain words, with Apply and Cancel. */
export function PlanView({
	summary,
	problems,
	onApply,
	onManual,
	onCancel
}: {
	summary: MakeSummary
	/** What the second check fixed: none, or null when it couldn't run. */
	problems: string[] | null
	/** Each gets the plan's lines, to show again over the chat in the editor. */
	onApply: (lines: string[]) => void
	onManual: (lines: string[]) => void
	onCancel: () => void
}) {
	const t = useTranslations('Make.plan')
	// Rounded once, so the headline and the times below agree.
	const seconds = Math.round(summary.editedSeconds)
	const length =
		seconds < SECONDS_PER_MINUTE
			? t('duration.seconds', { count: seconds })
			: t('duration.minutes', {
					minutes: Math.floor(seconds / SECONDS_PER_MINUTE),
					seconds: seconds % SECONDS_PER_MINUTE
				})
	const shortened = summary.removedParts > 0 || summary.fillerCuts > 0

	/** The Shape row: the shape and how the video goes into it, then why. */
	function shapeLines({ shape, card, screen }: MakeSummary): string[] {
		const name = t(`shape.names.${shape.target}`)
		// A screen recording: its treatment, then why.
		if (screen) {
			const how =
				screen.treatment === 'designed'
					? t('shape.screenDesigned', { shape: name })
					: shape.how === 'whole'
						? t(shape.fit === 'blur' ? 'shape.blur' : 'shape.bars', { shape: name })
						: shape.how === 'matches'
							? t('shape.matches', { shape: name })
							: t('shape.kept')
			return [how, t(`shape.screenWhy.${screen.treatment}.${screen.why}`)]
		}
		switch (shape.how) {
			case 'kept':
				return [t('shape.kept')]
			case 'matches':
				return [t('shape.matches', { shape: name })]
			case 'designed':
				return [t(card === 'hidden' ? 'shape.designedHidden' : 'shape.designed')]
			case 'face':
				return [
					t('shape.face', { shape: name }),
					t(shape.asked ? 'shape.why.asked' : 'shape.why.face')
				]
			case 'centred':
				return [t('shape.centred', { shape: name }), t('shape.why.asked')]
			case 'whole':
				return [
					t(shape.fit === 'blur' ? 'shape.blur' : 'shape.bars', { shape: name }),
					t(shape.asked ? 'shape.why.asked' : 'shape.why.whole')
				]
		}
	}
	// The parts of a brief the plan used: those the user's words gave, and those it chose.
	const { brief: parts, questions } = summary
	// Asked on the quick questions: the user's when picked, chosen for them when not.
	const asked: { text: string; said: boolean }[] = [
		...(questions?.kind
			? [{ text: t('brief.kind', { kind: questions.kind.value }), said: questions.kind.said }]
			: []),
		...(questions?.shape
			? [{ text: t('brief.shape', { shape: questions.shape.value }), said: questions.shape.said }]
			: [])
	]
	const briefParts: { part: BriefPart; text: string }[] = [
		...(parts.audience
			? [{ part: 'audience' as const, text: t('brief.audience', { text: parts.audience }) }]
			: []),
		...(parts.tone ? [{ part: 'tone' as const, text: t('brief.tone', { text: parts.tone }) }] : []),
		...(parts.show ? [{ part: 'show' as const, text: t('brief.show', { text: parts.show }) }] : []),
		...(parts.callToAction
			? [
					{
						part: 'callToAction' as const,
						text: t('brief.callToAction', { text: parts.callToAction })
					}
				]
			: [])
	]
	// The brief's own parts first, then what the quick questions asked.
	const briefSaid = [
		...briefParts.filter(({ part }) => parts.said[part]).map(({ text }) => text),
		...asked.filter(({ said }) => said).map(({ text }) => text)
	]
	const briefChosen = [
		...briefParts.filter(({ part }) => !parts.said[part]).map(({ text }) => text),
		...asked.filter(({ said }) => !said).map(({ text }) => text)
	]
	// Each line of the plan, under the row of the plan card it belongs to; the
	// lines themselves are the same words as ever.
	const entries: { row: PlanRow | 'note'; text: string }[] = [
		{
			row: 'length',
			text: shortened
				? t('shortened', {
						from: formatTimecode(summary.originalSeconds),
						to: formatTimecode(seconds)
					})
				: t('whole', { length: formatTimecode(seconds) })
		},
		...(summary.keptSentences < summary.totalSentences
			? [
					{
						row: 'length' as const,
						text: t('keptSentences', {
							kept: summary.keptSentences,
							total: summary.totalSentences
						})
					}
				]
			: []),
		...(summary.fillerCuts > 0
			? [{ row: 'length' as const, text: t('fillers', { count: summary.fillerCuts }) }]
			: []),
		// A length asked (typed, clicked or in a follow-up) or chosen: said so, and
		// whether a reel's under-a-minute rule caps it. Otherwise the reel rule, if any.
		...(summary.maxSeconds !== null
			? [
					{
						row: 'length' as const,
						text: t(parts.said.lengthSeconds ? 'lengthAsked' : 'lengthChosen', {
							seconds: Math.round(summary.maxSeconds)
						})
					},
					...(summary.limitSeconds !== null && summary.limitSeconds < summary.maxSeconds
						? [
								{
									row: 'length' as const,
									text: t('lengthCapped', { seconds: summary.limitSeconds })
								}
							]
						: []),
					...(summary.trimmedToFit
						? [
								{
									row: 'length' as const,
									text: t('fitCutTo', {
										seconds: summary.limitSeconds ?? Math.round(summary.maxSeconds)
									})
								}
							]
						: [])
				]
			: summary.limitSeconds === null
				? []
				: [{ row: 'length' as const, text: t(summary.trimmedToFit ? 'fitCut' : 'fitOk') }]),
		...(summary.lengthened ? [{ row: 'length' as const, text: t('lengthened') }] : []),
		...(summary.opensWith
			? [
					{
						row: 'note' as const,
						text: t('opensWith', { line: firstWords(summary.opensWith, OPENER_WORDS) })
					}
				]
			: []),
		{ row: 'captions', text: t(`captions.${summary.captions}`) },
		...(summary.keyLines > 0
			? [{ row: 'screen' as const, text: t('keyLines', { count: summary.keyLines }) }]
			: []),
		...(summary.zooms > 0
			? [{ row: 'motion' as const, text: t('zooms', { count: summary.zooms }) }]
			: []),
		...(summary.transitions > 0
			? [
					{
						row: 'motion' as const,
						text: t(`transitions.${summary.transition}`, { count: summary.transitions })
					}
				]
			: []),
		{
			row: 'music',
			text: summary.music
				? t('music', { name: summary.music })
				: summary.musicMissing
					? t('noMusicFolder')
					: t('noMusic')
		},
		...shapeLines(summary).map((text) => ({ row: 'shape' as const, text })),
		...(summary.title
			? [{ row: 'screen' as const, text: t('title', { text: summary.title }) }]
			: []),
		...(summary.titleDropped ? [{ row: 'screen' as const, text: t('titleDropped') }] : []),
		...(summary.pictureMatters ? [] : [{ row: 'note' as const, text: t('speechOnly') }]),
		...(briefSaid.length > 0
			? [{ row: 'note' as const, text: t('brief.used', { parts: briefSaid.join(' · ') }) }]
			: []),
		...(briefChosen.length > 0
			? [
					{
						row: 'note' as const,
						text: t('brief.chosen', { for: parts.chosenFor, parts: briefChosen.join(' · ') })
					}
				]
			: [])
	]
	// The look: the user's when their words or a click chose it, chosen for them otherwise.
	const lookLine = summary.look.said
		? t('look.asked', { preset: summary.look.preset })
		: t('look.chosen', { preset: summary.look.preset, making: summary.making })
	const shortNote = summary.short ? t(`short.${summary.short}`, { length }) : null
	// The lines shown again over the chat in the editor: the plan's, and the warning if any.
	const lines = [...entries.map(({ text }) => text), ...(shortNote ? [shortNote] : [])]
	const rows = PLAN_ROWS.flatMap(({ key, icon: Icon }) => {
		const texts = entries.filter((entry) => entry.row === key).map(({ text }) => text)
		return texts.length > 0 ? [{ key, Icon, texts }] : []
	})
	const notes = [
		lookLine,
		...entries.filter((entry) => entry.row === 'note').map(({ text }) => text)
	]
	return (
		<section role="status" aria-label={t('label')} className="flex w-full flex-col gap-4">
			<div className="flex flex-col gap-2.5">
				<p className="text-accent-fg font-mono text-[11.5px] tracking-[0.08em] uppercase">
					{t('label')} · {t('notApplied')}
				</p>
				<h2 className="text-text text-[clamp(28px,3vw,40px)] leading-[1.02] tracking-[-0.03em]">
					{t(`making.${summary.making}`, { length })}
				</h2>
				{summary.summary && <p className="text-text-muted">{summary.summary}</p>}
			</div>
			{shortNote && (
				<p
					role="note"
					className="bg-warning/10 text-text flex items-start gap-2 rounded-xl p-3 text-sm"
				>
					<span className="text-warning mt-0.5 shrink-0">
						<AlertIcon size={15} />
					</span>
					{shortNote}
				</p>
			)}
			{notes.length > 0 && (
				<ul className="text-text-muted flex flex-col gap-0.5 text-[13.5px]">
					{notes.map((note) => (
						<li key={note}>{note}</li>
					))}
				</ul>
			)}
			<ol className="border-border border-t">
				{rows.map(({ key, texts }) => (
					<li
						key={key}
						className="rt-fade-in border-border grid grid-cols-[7.5em_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 border-b py-[11px] max-[560px]:grid-cols-1"
					>
						<span className="text-text-faint text-[13.5px]">{t(`rows.${key}`)}</span>
						<span className="flex min-w-0 flex-col gap-0.5">
							{texts.map((text, index) => (
								<span
									key={text}
									className={
										index === 0 ? 'text-text font-semibold' : 'text-text-muted text-[13px]'
									}
								>
									{text}
								</span>
							))}
						</span>
					</li>
				))}
			</ol>
			<div className="flex flex-col gap-1">
				<p
					className={cn(
						'flex items-center gap-1.5 text-[13.5px] font-semibold',
						problems === null ? 'text-text-muted' : 'text-success'
					)}
				>
					{problems !== null && <CheckIcon size={14} />}
					{problems === null
						? t('check.failed')
						: problems.length === 0
							? t('check.ok')
							: t('check.fixed')}
				</p>
				{problems && problems.length > 0 && (
					<ul className="text-text-muted list-disc pl-5 text-sm">
						{problems.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				)}
			</div>
			{summary.cannotDo.length > 0 && (
				<div className="border-border flex flex-col gap-1 rounded-[14px] border p-4">
					<p className="text-text text-sm font-semibold">{t('cannotDo')}</p>
					<ul className="text-text-muted list-disc pl-5 text-sm">
						{summary.cannotDo.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</div>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<Button type="button" onClick={() => onApply(lines)}>
					{t('apply')}
				</Button>
				<Button type="button" variant="outline" onClick={() => onManual(lines)}>
					{t('manual')}
				</Button>
				<Button type="button" variant="outline" onClick={onCancel}>
					{t('change')}
				</Button>
				<Button type="button" variant="ghost" className="ml-auto" onClick={onCancel}>
					{t('cancel')}
				</Button>
			</div>
		</section>
	)
}
