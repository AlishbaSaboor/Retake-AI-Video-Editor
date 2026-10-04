'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SendIcon, SpinnerIcon, SuccessIcon } from '@/components/ui/icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { sendContactMessage } from './actions'
import { MAX_MESSAGE_LENGTH } from './contact-schema'

export function ContactForm() {
	const t = useTranslations('Site.contact.form')
	const [pending, startTransition] = useTransition()
	const [sent, setSent] = useState(false)
	const [error, setError] = useState<string | null>(null)

	if (sent) {
		return (
			<div
				role="status"
				className="border-border bg-surface flex flex-col items-start gap-3 rounded-lg border p-6"
			>
				<SuccessIcon size={28} className="text-success" />
				<h2 className="font-display text-text text-xl font-semibold">{t('sentTitle')}</h2>
				<p className="text-text-muted">{t('sentBody')}</p>
				<Button type="button" variant="outline" onClick={() => setSent(false)}>
					{t('another')}
				</Button>
			</div>
		)
	}

	return (
		<form
			className="border-border bg-surface flex flex-col gap-5 rounded-lg border p-6"
			onSubmit={(event) => {
				event.preventDefault()
				const form = new FormData(event.currentTarget)
				setError(null)
				startTransition(async () => {
					const result = await sendContactMessage({
						name: form.get('name'),
						email: form.get('email'),
						message: form.get('message')
					})
					if (result.ok) setSent(true)
					else setError(result.status === 400 ? t('invalid') : result.error)
				})
			}}
		>
			<div className="grid gap-5 sm:grid-cols-2">
				<div className="flex flex-col gap-2">
					<Label htmlFor="contact-name">{t('name')}</Label>
					<Input id="contact-name" name="name" required maxLength={100} autoComplete="name" />
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="contact-email">{t('email')}</Label>
					<Input
						id="contact-email"
						name="email"
						type="email"
						required
						maxLength={254}
						autoComplete="email"
					/>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="contact-message">{t('message')}</Label>
				<Textarea
					id="contact-message"
					name="message"
					required
					rows={6}
					maxLength={MAX_MESSAGE_LENGTH}
				/>
			</div>
			{error && (
				<p role="alert" className="text-danger text-sm">
					{error}
				</p>
			)}
			<Button type="submit" size="lg" disabled={pending} className="self-start">
				{pending ? <SpinnerIcon /> : <SendIcon />}
				{t('send')}
			</Button>
		</form>
	)
}
