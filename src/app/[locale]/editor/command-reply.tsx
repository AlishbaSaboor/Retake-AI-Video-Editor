'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { CommandOutcome, CommandPlan } from './edit-command'
import { formatTimecode } from './timeline-scale'

type CommandReplyProps = {
	/** What the user typed, quoted back so the reply reads as an answer to it. */
	command: string
	outcome: CommandOutcome
	durationSeconds: number
	/** Whether a watermark plan moves the logo already there, or adds one. */
	hasWatermark: boolean
	onApply: () => void
	onDismiss: () => void
}

// What the editor can really do today, for the "I can't do that yet" reply.
// Every action has a command; what only the editor itself does is listed as
// where to find it, so the reply never implies a command that doesn't exist.
const COMMAND_ABILITIES = [
	'trimRange',
	'trimToEnd',
	'split',
	'merge',
	'reorder',
	'cleanup',
	'undoRedo',
	'speed',
	'reRecord',
	'export',
	'addTitle',
	'addWatermark',
	'captions',
	'annotate',
	'transform',
	'audio',
	'clipSpeed',
	'transitions',
	'deleteDuplicate',
	'color',
	'textStyle',
	'audioLane',
	'addVideo'
] as const
const EDITOR_ABILITIES = [
	'fillerCut',
	'compare',
	'annotations',
	'transformByHand',
	'pencil'
] as const

/**
 * The bar's answer to a parsed command: the plan to confirm, or — when the
 * command can't be done — a plain explanation instead of an error.
 */
export function CommandReply({
	command,
	outcome,
	durationSeconds,
	hasWatermark,
	onApply,
	onDismiss
}: CommandReplyProps) {
	const t = useTranslations('Editor.command')
	const tReRecord = useTranslations('Editor.reRecord')

	function describe(plan: CommandPlan): string {
		switch (plan.kind) {
			case 'trim': {
				const kept = plan.range.endSeconds - plan.range.startSeconds
				return t('confirm.plan', {
					start: formatTimecode(plan.range.startSeconds),
					end: formatTimecode(plan.range.endSeconds),
					kept: kept.toFixed(1),
					removed: (durationSeconds - kept).toFixed(1)
				})
			}
			case 'split':
				return t('confirm.split', { at: formatTimecode(plan.seconds) })
			case 'merge':
				return t('confirm.merge', { from: plan.from + 1, to: plan.to + 1 })
			case 'move':
				return t('confirm.move', { from: plan.from + 1, to: plan.to + 1 })
			case 'cleanup':
				return t('confirm.cleanup', { seconds: Math.max(1, Math.round(plan.seconds)) })
			case 'undo':
			case 'redo':
			case 'reset':
			case 'export':
				return t(`confirm.${plan.kind}`)
			case 'speed':
				return t('confirm.speed', { rate: plan.rate })
			case 'rerecord':
				return t('confirm.rerecord', {
					text: plan.sentence.text,
					at: formatTimecode(plan.sentence.startSeconds)
				})
			case 'title':
				return t('confirm.title', {
					text: plan.title.text,
					start: formatTimecode(plan.title.startSeconds),
					end: formatTimecode(plan.title.startSeconds + plan.title.durationSeconds)
				})
			case 'watermark': {
				const corner = t(`corners.${plan.corner}`)
				return hasWatermark
					? t('confirm.watermarkMove', { corner })
					: t('confirm.watermarkNew', { corner })
			}
			case 'captions':
				return plan.on ? t('confirm.captionsOn') : t('confirm.captionsOff')
			case 'clipAudio': {
				const { change } = plan
				const which =
					'clip' in change && change.clip !== null
						? t('clipNumber', { number: change.clip })
						: t('everyClip')
				if (change.kind === 'volume') {
					return t('confirm.volume', { which, percent: change.percent })
				}
				if (change.kind === 'fade_in' || change.kind === 'fade_out') {
					return t(`confirm.${change.kind}`, { which, seconds: change.seconds })
				}
				return t(`confirm.${change.kind}`, { which })
			}
			case 'transition': {
				const which = plan.pair
					? t('joinPair', { from: plan.pair.from, to: plan.pair.to })
					: t('everyJoin')
				if (plan.transition === null) return t('confirm.removeTransition', { which })
				const added = t('confirm.transition', {
					kind: plan.transition,
					seconds: plan.seconds,
					which
				})
				return plan.shortened ? `${added} ${t('confirm.transitionShortened')}` : added
			}
			case 'color': {
				const which = plan.clip === null ? t('everyClip') : t('clipNumber', { number: plan.clip })
				const { change } = plan
				if (change.kind === 'normal') return t('confirm.colorNormal', { which })
				if (change.kind === 'look') {
					return t('confirm.colorLook', { which, look: t(`looks.${change.look}`) })
				}
				return t('confirm.colorLevel', {
					which,
					level: t(`levels.${change.level}`),
					percent: change.percent
				})
			}
			case 'textStyle': {
				const { changes } = plan
				const parts = [
					changes.color && t('styleParts.color', { color: changes.color }),
					changes.background === null
						? t('styleParts.noBackground')
						: changes.background && t('styleParts.background', { color: changes.background }),
					changes.font && t('styleParts.font', { font: t(`fonts.${changes.font}`) }),
					changes.size !== undefined &&
						t('styleParts.size', { percent: Math.round(changes.size * 100) })
				].filter((part): part is string => typeof part === 'string')
				return t('confirm.textStyle', {
					target: t(`textTargets.${plan.target}`),
					changes: parts.join(', ')
				})
			}
			case 'addVideo':
				return t('confirm.addVideo')
			case 'addAudio':
				return t('confirm.addAudio', { at: formatTimecode(plan.seconds) })
			case 'extractAudio':
				return t('confirm.extractAudio', { number: plan.clip })
			case 'deleteAudio':
				return t('confirm.deleteAudio', { number: plan.item })
			case 'deleteClip':
				return t('confirm.deleteClip', { number: plan.clip })
			case 'duplicateClip':
				return t('confirm.duplicateClip', { number: plan.clip })
			case 'clipSpeed': {
				if (plan.skipsTakes) return t('confirm.clipSpeedSkipping', { speed: plan.speed })
				const which = plan.clip === null ? t('everyClip') : t('clipNumber', { number: plan.clip })
				return t('confirm.clipSpeed', { which, speed: plan.speed })
			}
			case 'transform': {
				const { change } = plan
				if (change.kind === 'rotate') {
					return t('confirm.rotate', {
						degrees: Math.abs(change.degrees),
						direction: change.degrees > 0 ? 'clockwise' : 'anticlockwise',
						to: change.to
					})
				}
				if (change.kind === 'flip') return t(`confirm.flip.${change.axis}`)
				return change.aspect === 'none'
					? t('confirm.uncrop')
					: t('confirm.crop', { aspect: change.aspect })
			}
			case 'annotation':
				return t(
					`confirm.${plan.annotation.kind === 'box' ? 'box' : plan.annotation.kind === 'pixelate' ? 'pixelate' : 'blur'}`,
					{
						region: t(`regions.${plan.region}`),
						start: formatTimecode(plan.annotation.startSeconds),
						end: formatTimecode(plan.annotation.endSeconds)
					}
				)
		}
	}

	return (
		<div
			role="status"
			className="border-accent/50 bg-surface flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-lg"
		>
			<div className="flex flex-col gap-1">
				<p className="text-text-muted text-xs">{t('asked', { command })}</p>
				{outcome.ok ? (
					<p className="text-text text-sm font-medium">{describe(outcome.plan)}</p>
				) : outcome.reason === 'out_of_range' ? (
					<>
						<p className="text-text text-sm font-medium">{t('out_of_range.title')}</p>
						<p className="text-text-muted text-xs">
							{t('out_of_range.description', { duration: formatTimecode(durationSeconds) })}
						</p>
					</>
				) : outcome.reason === 'cannot_rerecord' ? (
					<>
						<p className="text-text text-sm font-medium">{t('refused.cannot_rerecord')}</p>
						<p className="text-text-muted text-xs">{tReRecord(`blocked.${outcome.blocker}`)}</p>
					</>
				) : outcome.reason !== 'unsupported' ? (
					<p className="text-text text-sm font-medium">{t(`refused.${outcome.reason}`)}</p>
				) : (
					<>
						<p className="text-text text-sm font-medium">{t('unsupported.title')}</p>
						<p className="text-text-muted text-xs">{t('unsupported.commandsIntro')}</p>
						<ul className="text-text-muted list-disc pl-5 text-xs">
							{COMMAND_ABILITIES.map((ability) => (
								<li key={ability}>{t(`unsupported.${ability}`)}</li>
							))}
						</ul>
						<p className="text-text-muted text-xs">{t('unsupported.editorIntro')}</p>
						<ul className="text-text-muted list-disc pl-5 text-xs">
							{EDITOR_ABILITIES.map((ability) => (
								<li key={ability}>{t(`unsupported.${ability}`)}</li>
							))}
						</ul>
					</>
				)}
			</div>
			<div className="ml-auto flex gap-2">
				{outcome.ok ? (
					<>
						<Button variant="outline" size="sm" onClick={onDismiss}>
							{t('confirm.cancel')}
						</Button>
						<Button size="sm" onClick={onApply}>
							{t('confirm.apply')}
						</Button>
					</>
				) : (
					<Button variant="outline" size="sm" onClick={onDismiss}>
						{t('dismiss')}
					</Button>
				)}
			</div>
		</div>
	)
}
