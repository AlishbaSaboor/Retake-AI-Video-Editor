'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { followUpMakeIt } from '@/app/[locale]/(app)/make/actions'
import {
	followUpPlan,
	PAGE_GRACE_MS,
	planChanges,
	planMake,
	PLAN_TIMEOUT_MS,
	type MadePlan,
	type MakeAnswer,
	type MakeBasis,
	type PlanChange
} from '@/app/[locale]/(app)/make/make-plan'
import { loadTrack } from '@/app/[locale]/(app)/make/music-track'
import { isPlainAiStatus } from '@/lib/ai-failure'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { withTimeout } from '@/lib/with-timeout'
import { formatTimecode } from '../../model/timeline-scale'
import type { Transcript } from '../../audio/transcript'

// Follow-ups to Make it's plan, in the chat beside the edited video: "make
// it shorter" changes the plan as applied (Gemini reads the plan and the
// transcript, not the pictures again), and the new plan is shown against
// the old one, applied only on Apply, as one undo step.

const SECONDS_PER_MINUTE = 60

/** What a follow-up came to: questions first, a changed plan, nothing changed, or a plain failure. */
export type FollowUpOutcome =
	| { kind: 'questions'; questions: string[] }
	| { kind: 'plan'; plan: MadePlan<AudioBuffer>; changes: PlanChange[]; cannotDo: string[] }
	| { kind: 'unchanged'; cannotDo: string[] }
	| { kind: 'failed'; message: string }

export type FollowUpAsk = {
	text: string
	answers: MakeAnswer[]
	/** The plan it changes: the one applied now, or the last applied when the edit has moved on. */
	base: MadePlan<AudioBuffer>
	basis: MakeBasis
	/** Follow-ups applied before this one. */
	earlier: string[]
	transcript: Transcript | null
	/** What to say when it fails for no reason the person can act on, or no plan comes back. */
	unclear: string
	noPlan: string
}

/**
 * Asks for the plan changed by one follow-up, and makes it as the first
 * plan was made (the same rules for length, quotes and names). The time
 * limit and the plain failures are the first plan's: the server's own words
 * for a refused key, a usage limit or a busy AI, `unclear` for the rest.
 */
export async function planFollowUp(ask: FollowUpAsk): Promise<FollowUpOutcome> {
	const { base, basis, transcript } = ask
	let result: Awaited<ReturnType<typeof followUpMakeIt>>
	try {
		result = await withTimeout(PLAN_TIMEOUT_MS + PAGE_GRACE_MS, () =>
			followUpMakeIt({
				request: basis.request,
				...(basis.choices && { choices: basis.choices }),
				earlier: ask.earlier,
				followUp: ask.text,
				answers: ask.answers,
				plan: base.reply,
				durationSeconds: basis.durationSeconds,
				editedSeconds: base.summary.editedSeconds,
				sentences: (transcript?.segments ?? []).map(({ startSeconds, endSeconds, text }) => ({
					startSeconds,
					endSeconds,
					text
				}))
			})
		)
	} catch (error) {
		captureClientError(error, { feature: 'make_it_follow_up' })
		return { kind: 'failed', message: ask.unclear }
	}
	if (!result.ok) {
		return { kind: 'failed', message: isPlainAiStatus(result.status) ? result.error : ask.unclear }
	}
	const answer = result.data.reply
	if (!answer) return { kind: 'failed', message: ask.noPlan }
	if (answer.questions.length > 0) return { kind: 'questions', questions: answer.questions }
	const reply = followUpPlan(base.reply, answer)
	const music =
		reply.music === null
			? null
			: reply.music === base.music?.name
				? base.music
				: await loadTrack(reply.music)
	const made = planMake({
		...basis,
		reply,
		transcript,
		music,
		followUps: [...ask.earlier, ask.text]
	})
	const plan = {
		reply: made.used,
		summary: made.summary,
		edit: made.edit,
		music
	}
	const changes = planChanges(base.summary, plan.summary)
	return changes.length === 0
		? { kind: 'unchanged', cannotDo: reply.cannotDo }
		: { kind: 'plan', plan, changes, cannotDo: reply.cannotDo }
}

/** A length as the change list says it: "35 s" under a minute, "1:20" from one. */
function lengthText(seconds: number): string {
	return seconds < SECONDS_PER_MINUTE ? `${seconds} s` : formatTimecode(seconds)
}

/** The answer to a follow-up in the chat: the plan's changes to apply or cancel, questions, or why not. */
export function FollowUpAnswer({
	outcome,
	handEdited,
	resolved,
	onApply,
	onCancel,
	onAnswer
}: {
	outcome: FollowUpOutcome
	/** The edit was changed by hand since the plan was applied: applying replaces those changes. */
	handEdited: boolean
	resolved?: 'applied' | 'cancelled' | 'answered'
	onApply: () => void
	onCancel: () => void
	onAnswer: (answers: MakeAnswer[]) => void
}) {
	const t = useTranslations('Editor.followUp')
	const [answers, setAnswers] = useState<string[]>([])

	function changeText(change: PlanChange): string {
		switch (change.kind) {
			case 'length':
				return t('changes.length', { from: lengthText(change.from), to: lengthText(change.to) })
			case 'captions':
				return t('changes.captions', {
					from: t(`captions.${change.from}`),
					to: t(`captions.${change.to}`)
				})
			case 'shape':
				return t('changes.shape', { from: t(`shape.${change.from}`), to: t(`shape.${change.to}`) })
			case 'fit':
				return t('changes.fit', { from: t(`fit.${change.from}`), to: t(`fit.${change.to}`) })
			case 'title':
			case 'music':
				return t(`changes.${change.kind}`, {
					from: change.from ?? t('none'),
					to: change.to ?? t('none')
				})
			default:
				return t(`changes.${change.kind}`, { from: change.from, to: change.to })
		}
	}

	const cannotDo =
		(outcome.kind === 'plan' || outcome.kind === 'unchanged') && outcome.cannotDo.length > 0 ? (
			<div className="flex flex-col gap-1">
				<p className="text-text text-xs font-semibold">{t('cannotDo')}</p>
				<ul className="text-text-muted list-disc pl-5 text-xs">
					{outcome.cannotDo.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
			</div>
		) : null

	return (
		<div
			role={resolved ? undefined : outcome.kind === 'failed' ? 'alert' : 'status'}
			aria-label={resolved ? undefined : t('label')}
			className={
				resolved
					? 'border-border bg-surface-inset flex flex-col gap-2 rounded-lg rounded-tl-sm border px-3 py-2.5 opacity-80'
					: 'border-accent/50 bg-surface flex flex-col gap-3 rounded-lg rounded-tl-sm border px-3 py-3 shadow-md'
			}
		>
			{outcome.kind === 'plan' && (
				<div className="flex flex-col gap-1.5">
					<p className="text-text text-sm font-medium">{t('changed')}</p>
					<ul className="flex flex-col gap-0.5">
						{outcome.changes.map((change) => (
							<li key={change.kind} className="text-text text-[13px] leading-snug">
								{changeText(change)}
							</li>
						))}
					</ul>
					{outcome.plan.summary.summary && (
						<p className="text-text-muted text-xs">{outcome.plan.summary.summary}</p>
					)}
					{cannotDo}
					{handEdited && !resolved && <p className="text-warning text-xs">{t('handEdited')}</p>}
				</div>
			)}
			{outcome.kind === 'unchanged' && (
				<div className="flex flex-col gap-1.5">
					<p className="text-text text-sm font-medium">{t('unchanged')}</p>
					{cannotDo}
				</div>
			)}
			{outcome.kind === 'failed' && <p className="text-text text-sm">{outcome.message}</p>}
			{outcome.kind === 'questions' && (
				<form
					className="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault()
						onAnswer(
							outcome.questions.map((question, index) => ({
								question,
								answer: answers[index]?.trim() ?? ''
							}))
						)
					}}
				>
					<p className="text-text text-sm font-medium">{t('questions')}</p>
					{outcome.questions.map((question, index) => (
						<label key={question} className="flex flex-col gap-1">
							<span className="text-text text-[13px]">{question}</span>
							<input
								value={answers[index] ?? ''}
								disabled={resolved !== undefined}
								onChange={(event) => {
									const value = event.target.value
									setAnswers((all) => {
										const next = [...all]
										next[index] = value
										return next
									})
								}}
								className="border-border bg-surface-inset text-text focus-visible:outline-accent rounded-md border px-2.5 py-1.5 text-sm focus-visible:outline-2"
							/>
						</label>
					))}
					{!resolved && (
						<div className="flex justify-end gap-2">
							<Button type="button" variant="outline" size="sm" onClick={onCancel}>
								{t('cancel')}
							</Button>
							<Button type="submit" size="sm">
								{t('answer')}
							</Button>
						</div>
					)}
				</form>
			)}
			{resolved ? (
				<p className="text-text-faint text-xs font-medium">{t(`resolved.${resolved}`)}</p>
			) : (
				outcome.kind !== 'questions' && (
					<div className="flex justify-end gap-2">
						<Button variant="outline" size="sm" onClick={onCancel}>
							{outcome.kind === 'plan' ? t('cancel') : t('dismiss')}
						</Button>
						{outcome.kind === 'plan' && (
							<Button size="sm" onClick={onApply}>
								{t('apply')}
							</Button>
						)}
					</div>
				)
			)}
		</div>
	)
}
