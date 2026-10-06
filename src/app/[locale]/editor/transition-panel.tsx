'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	clampTransitionSeconds,
	DEFAULT_TRANSITION_SECONDS,
	MIN_TRANSITION_SECONDS,
	TRANSITION_KINDS,
	type Transition,
	type TransitionKind
} from './transitions'
import { MoreInfo } from './more-info'

const SECONDS_STEP = 0.1

/** One join between two clips: what's set on it, and how long it can be at most. */
export type JoinState = { transition: Transition | null; limit: number }

type TransitionPanelProps = {
	/** Join `i` is between clips i + 1 and i + 2. */
	joins: JoinState[]
	/** False outside the Edited view: transitions are set on the edit. */
	canEdit: boolean
	/** Sets (or, with null, removes) the transition into clip `index` (from 0). */
	onChange: (index: number, transition: { kind: TransitionKind; seconds: number } | null) => void
}

/**
 * A row per join between adjacent clips: a plain cut, a fade through
 * black or a dissolve, and how long. Each change is one undo step. A join
 * against a re-recorded sentence, or between clips too short, can't have one.
 */
export function TransitionPanel({ joins, canEdit, onChange }: TransitionPanelProps) {
	const t = useTranslations('Editor.transitions')
	// One clip has no joins: say how to get some, rather than show nothing.
	if (joins.length === 0) return <p className="text-text-muted text-sm">{t('none')}</p>
	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4"
		>
			<h2 className="sr-only">{t('label')}</h2>
			{joins.map((join, index) => (
				<JoinRow
					// Follows what's set, so an undo resets what's typed.
					key={`${index}-${JSON.stringify(join.transition)}`}
					from={index + 1}
					join={join}
					canEdit={canEdit}
					onChange={(transition) => onChange(index + 1, transition)}
				/>
			))}
			<MoreInfo>{t('hint')}</MoreInfo>
		</section>
	)
}

function JoinRow({
	from,
	join,
	canEdit,
	onChange
}: {
	from: number
	join: JoinState
	canEdit: boolean
	onChange: (transition: { kind: TransitionKind; seconds: number } | null) => void
}) {
	const t = useTranslations('Editor.transitions')
	const id = useId()
	const { transition, limit } = join
	const [typed, setTyped] = useState(String(transition?.seconds ?? DEFAULT_TRANSITION_SECONDS))
	const possible = limit >= MIN_TRANSITION_SECONDS
	const name = t('join', { from, to: from + 1 })

	function choose(kind: TransitionKind | null) {
		if (kind === null) {
			if (transition) onChange(null)
			return
		}
		if (kind === transition?.kind) return
		onChange({ kind, seconds: transition?.seconds ?? DEFAULT_TRANSITION_SECONDS })
	}

	function commitSeconds() {
		const seconds = Number.parseFloat(typed)
		if (!transition || !Number.isFinite(seconds)) {
			setTyped(String(transition?.seconds ?? DEFAULT_TRANSITION_SECONDS))
			return
		}
		const next = clampTransitionSeconds(seconds)
		setTyped(String(next))
		if (next !== transition.seconds) onChange({ kind: transition.kind, seconds: next })
	}

	return (
		<div role="group" aria-label={name} className="flex flex-wrap items-end gap-3">
			<span className="text-text w-28 shrink-0 pb-2 text-xs font-medium">{name}</span>
			<div className="flex gap-1 pb-0.5">
				{([null, ...TRANSITION_KINDS] as const).map((kind) => {
					const active = (transition?.kind ?? null) === kind
					return (
						<Button
							key={kind ?? 'cut'}
							type="button"
							size="sm"
							variant={active ? 'secondary' : 'ghost'}
							aria-pressed={active}
							disabled={!canEdit || (kind !== null && !possible)}
							onClick={() => choose(kind)}
						>
							{t(`kinds.${kind ?? 'cut'}`)}
						</Button>
					)
				})}
			</div>
			<form
				className="flex flex-col gap-1"
				onSubmit={(event) => {
					event.preventDefault()
					commitSeconds()
				}}
			>
				<Label htmlFor={`${id}-seconds`}>{t('seconds')}</Label>
				<Input
					id={`${id}-seconds`}
					type="number"
					min={MIN_TRANSITION_SECONDS}
					step={SECONDS_STEP}
					value={typed}
					disabled={!canEdit || !transition}
					onChange={(event) => setTyped(event.target.value)}
					onBlur={commitSeconds}
					className="w-24"
				/>
			</form>
			<p className="text-text-muted pb-2 text-xs">
				{possible
					? transition && transition.seconds > limit
						? t('shortened', { seconds: Math.round(limit * 100) / 100 })
						: t('upTo', { seconds: Math.round(limit * 100) / 100 })
					: t('notPossible')}
			</p>
		</div>
	)
}
