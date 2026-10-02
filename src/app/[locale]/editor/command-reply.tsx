'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { CommandOutcome } from './edit-command'
import { formatTimecode } from './timeline-scale'

type CommandReplyProps = {
	/** What the user typed, quoted back so the reply reads as an answer to it. */
	command: string
	outcome: CommandOutcome
	durationSeconds: number
	onApply: () => void
	onDismiss: () => void
}

// What the editor can really do today, for the "I can't do that yet" reply.
// Typed commands can only trim; the rest is listed as where to find it, so
// the reply never implies a command that doesn't exist.
const COMMAND_ABILITIES = ['trimRange', 'trimToEnd'] as const
const EDITOR_ABILITIES = ['cleanup', 'fillerCut', 'handTrim'] as const

/**
 * The bar's answer to a parsed command: the plan to confirm, or — when the
 * command can't be done — a plain explanation instead of an error.
 */
export function CommandReply({
	command,
	outcome,
	durationSeconds,
	onApply,
	onDismiss
}: CommandReplyProps) {
	const t = useTranslations('Editor.command')

	return (
		<div
			role="status"
			className="border-accent/50 bg-surface flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-lg"
		>
			<div className="flex flex-col gap-1">
				<p className="text-text-muted text-xs">{t('asked', { command })}</p>
				{outcome.ok ? (
					<p className="text-text text-sm font-medium">
						{t('confirm.plan', {
							start: formatTimecode(outcome.range.startSeconds),
							end: formatTimecode(outcome.range.endSeconds),
							kept: (outcome.range.endSeconds - outcome.range.startSeconds).toFixed(1),
							removed: (
								durationSeconds -
								(outcome.range.endSeconds - outcome.range.startSeconds)
							).toFixed(1)
						})}
					</p>
				) : outcome.reason === 'out_of_range' ? (
					<>
						<p className="text-text text-sm font-medium">{t('out_of_range.title')}</p>
						<p className="text-text-muted text-xs">
							{t('out_of_range.description', { duration: formatTimecode(durationSeconds) })}
						</p>
					</>
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
