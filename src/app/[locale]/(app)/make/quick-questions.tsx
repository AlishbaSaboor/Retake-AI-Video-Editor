'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import {
	AD_SHAPES,
	decideAll,
	MAKE_KINDS,
	MAX_BRIEF_PART_LENGTH,
	questionsToAsk,
	type MakeChoices
} from './make-questions'

// The quick questions before Make it plans: only those the request leaves
// open, on one screen, each with "You decide" (picked until something else
// is). Fixed choices, no AI call; an ad's shape shows once it's an ad.

/** One question's choices, "You decide" last: a radio group, a pill each. */
function Choices<T extends string>({
	legend,
	options,
	value,
	onChange,
	label,
	decide
}: {
	legend: string
	options: readonly T[]
	value: T | null
	onChange: (value: T | null) => void
	label: (option: T) => string
	decide: string
}) {
	const name = useId()
	const all: Array<{ key: string; option: T | null; text: string }> = [
		...options.map((option) => ({ key: option, option, text: label(option) })),
		{ key: 'decide', option: null, text: decide }
	]
	return (
		<fieldset className="flex flex-col gap-2">
			<legend className="text-text mb-2 text-sm font-bold">{legend}</legend>
			<div className="flex flex-wrap gap-2">
				{all.map(({ key, option, text }) => (
					<label
						key={key}
						className={cn(
							'has-focus-visible:outline-accent relative inline-flex h-[38px] cursor-pointer items-center rounded-full border px-3.5 text-[13.5px] font-bold transition-colors has-focus-visible:outline-2',
							value === option
								? 'border-accent/60 bg-accent-soft text-accent-fg'
								: 'border-border text-text-muted hover:border-border-strong hover:text-text'
						)}
					>
						{/* Over the whole pill, unseen: a click anywhere on it picks it. */}
						<input
							type="radio"
							name={name}
							className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
							checked={value === option}
							onChange={() => onChange(option)}
						/>
						{text}
					</label>
				))}
			</div>
		</fieldset>
	)
}

/** A short text answer, empty for "Retake decides". */
function TextChoice({
	label,
	placeholder,
	value,
	onChange
}: {
	label: string
	placeholder: string
	value: string
	onChange: (value: string) => void
}) {
	const id = useId()
	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={id} className="text-text text-sm font-bold">
				{label}
			</label>
			<Input
				id={id}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				maxLength={MAX_BRIEF_PART_LENGTH}
				placeholder={placeholder}
				className="h-11 rounded-[14px] px-4 text-base"
			/>
		</div>
	)
}

/**
 * The questions the request leaves open, answered: each the user's when
 * picked, left to Retake when not. Skip all leaves every one to Retake.
 */
export function QuickQuestions({
	request,
	onDone,
	onCancel
}: {
	request: string
	onDone: (choices: MakeChoices) => void
	onCancel: () => void
}) {
	const t = useTranslations('Make.ask')
	const [kind, setKind] = useState<MakeChoices['kind']>(null)
	const [adShape, setAdShape] = useState<MakeChoices['adShape']>(null)
	const [tone, setTone] = useState('')
	const [callToAction, setCallToAction] = useState('')
	// Asked again as answers come in: an ad's shape once it's an ad.
	const shown = questionsToAsk(request, { kind })
	const has = (id: (typeof shown)[number]) => shown.includes(id)
	const text = (value: string) => value.trim() || null
	return (
		<form
			className="flex flex-col gap-5"
			aria-labelledby="quick-questions-title"
			onSubmit={(event) => {
				event.preventDefault()
				onDone({
					...decideAll(shown),
					kind: has('kind') ? kind : null,
					adShape: has('adShape') ? adShape : null,
					tone: has('tone') ? text(tone) : null,
					callToAction: has('callToAction') ? text(callToAction) : null
				})
			}}
		>
			<div className="flex flex-col gap-1.5">
				<h2
					id="quick-questions-title"
					className="text-text text-[25px] font-extrabold tracking-[-0.02em]"
				>
					{t('title')}
				</h2>
				<p className="text-text-muted text-sm">{t('intro')}</p>
			</div>
			{has('kind') && (
				<Choices
					legend={t('kind.label')}
					options={MAKE_KINDS}
					value={kind}
					onChange={setKind}
					label={(option) => t(`kind.${option}`)}
					decide={t('decide')}
				/>
			)}
			{has('adShape') && (
				<Choices
					legend={t('adShape.label')}
					options={AD_SHAPES}
					value={adShape}
					onChange={setAdShape}
					label={(option) => t(`adShape.${option}`)}
					decide={t('decide')}
				/>
			)}
			{(has('tone') || has('callToAction')) && (
				<div className="flex flex-col gap-3">
					{has('tone') && (
						<TextChoice
							label={t('tone.label')}
							placeholder={t('tone.placeholder')}
							value={tone}
							onChange={setTone}
						/>
					)}
					{has('callToAction') && (
						<TextChoice
							label={t('callToAction.label')}
							placeholder={t('callToAction.placeholder')}
							value={callToAction}
							onChange={setCallToAction}
						/>
					)}
					<p className="text-text-faint -mt-1 text-[12.5px]">{t('optional')}</p>
				</div>
			)}
			<div className="flex flex-wrap gap-2">
				<Button type="submit">{t('submit')}</Button>
				<Button type="button" variant="outline" onClick={() => onDone(decideAll(shown))}>
					{t('skipAll')}
				</Button>
				<Button type="button" variant="ghost" className="ml-auto" onClick={onCancel}>
					{t('cancel')}
				</Button>
			</div>
		</form>
	)
}
