'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDownIcon, SpinnerIcon, SuccessIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { sendContactMessage } from './actions'
import {
	CONTACT_TOPICS,
	HONEYPOT_FIELD,
	MAX_MESSAGE_LENGTH,
	MAX_NAME_LENGTH
} from './contact-schema'

const field =
	'border-border-strong bg-surface text-text placeholder:text-text-faint focus-visible:border-accent w-full rounded border px-3.5 text-[15.5px] transition-colors focus-visible:shadow-[0_0_0_4px_var(--accent-soft)] focus-visible:outline-none'
const label = 'text-text text-[13.5px] font-semibold'
const pill =
	'rt-btn bg-accent text-accent-ink focus-visible:outline-accent inline-flex min-h-[52px] items-center gap-2 self-start rounded-full px-6 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60'

export function ContactForm() {
	const t = useTranslations('Site.contact.form')
	const [pending, startTransition] = useTransition()
	const [sent, setSent] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const card =
		'border-border bg-surface flex flex-col rounded-3xl border p-[clamp(20px,3vw,36px)] shadow-(--shadow-card)'

	if (sent) {
		return (
			<div role="status" className={cn(card, 'items-start gap-3')}>
				<SuccessIcon size={30} className="text-success" />
				<h2 className="text-text font-display text-4xl font-medium">{t('sentTitle')}</h2>
				<p className="text-text-muted">{t('sentBody')}</p>
				<button type="button" className={cn(pill, 'mt-2')} onClick={() => setSent(false)}>
					{t('another')}
				</button>
			</div>
		)
	}

	return (
		<form
			className={cn(card, 'gap-5')}
			onSubmit={(event) => {
				event.preventDefault()
				const form = new FormData(event.currentTarget)
				setError(null)
				startTransition(async () => {
					const result = await sendContactMessage({
						name: form.get('name'),
						email: form.get('email'),
						topic: form.get('topic'),
						message: form.get('message'),
						website: form.get(HONEYPOT_FIELD)
					})
					if (result.ok) setSent(true)
					else if (result.status === 400) setError(t('invalid'))
					else if (result.status === 429) setError(t('refused'))
					else setError(result.error)
				})
			}}
		>
			{/* Out of sight and out of the tab order, so only a bot fills it in. */}
			<div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
				<label>
					{t('honeypot')}
					<input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
				</label>
			</div>
			<div className="grid gap-5 sm:grid-cols-2">
				<div className="flex flex-col gap-2">
					<label htmlFor="contact-name" className={label}>
						{t('name')}
					</label>
					<input
						id="contact-name"
						name="name"
						maxLength={MAX_NAME_LENGTH}
						autoComplete="name"
						placeholder={t('namePlaceholder')}
						className={cn(field, 'h-[54px]')}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="contact-email" className={label}>
						{t('email')}
					</label>
					<input
						id="contact-email"
						name="email"
						type="email"
						required
						maxLength={254}
						autoComplete="email"
						placeholder={t('emailPlaceholder')}
						className={cn(field, 'h-[54px]')}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<label htmlFor="contact-topic" className={label}>
					{t('topic')}
				</label>
				<div className="relative">
					<select
						id="contact-topic"
						name="topic"
						defaultValue="question"
						className={cn(field, 'h-[52px] cursor-pointer appearance-none pr-10')}
					>
						{CONTACT_TOPICS.map((topic) => (
							<option key={topic} value={topic}>
								{t(`topics.${topic}`)}
							</option>
						))}
					</select>
					<ChevronDownIcon
						size={16}
						className="text-text-muted pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
					/>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<label htmlFor="contact-message" className={label}>
					{t('message')}
				</label>
				<textarea
					id="contact-message"
					name="message"
					required
					rows={6}
					maxLength={MAX_MESSAGE_LENGTH}
					placeholder={t('messagePlaceholder')}
					className={cn(field, 'min-h-[150px] resize-y py-3.5')}
				/>
			</div>
			{error && (
				<p role="alert" className="text-danger text-sm">
					{error}
				</p>
			)}
			<button type="submit" disabled={pending} className={pill}>
				{pending && <SpinnerIcon />}
				{t('send')}
			</button>
		</form>
	)
}
