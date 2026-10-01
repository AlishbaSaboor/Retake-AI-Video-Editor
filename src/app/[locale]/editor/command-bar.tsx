'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { AiIcon, SpinnerIcon } from '@/components/ui/icons'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { parseEditCommand } from './actions'
import { commandToTrim } from './edit-command'
import { formatTimecode, type TrimRange } from './timeline-scale'

const AI_ICON_SIZE = 20

type CommandBarProps = {
	durationSeconds: number
	onTrim: (range: TrimRange) => void
}

/** Type an edit in plain English; Gemini parses it, the trim logic applies it. */
export function CommandBar({ durationSeconds, onTrim }: CommandBarProps) {
	const t = useTranslations('Editor.command')
	const [command, setCommand] = useState('')

	const parse = useMutation({
		mutationFn: async (text: string) => {
			const result = await parseEditCommand({ command: text, durationSeconds })
			if (!result.ok) throw new Error(result.error)
			return result.data
		},
		onSuccess: (parsed) => {
			const outcome = commandToTrim(parsed, durationSeconds)
			if (outcome.ok) {
				onTrim(outcome.range)
				setCommand('')
				return
			}
			toast({
				variant: 'destructive',
				title: t(`${outcome.reason}.title`),
				description: t(`${outcome.reason}.description`, {
					duration: formatTimecode(durationSeconds)
				})
			})
		},
		onError: (error) => {
			toast({ variant: 'destructive', title: t('failed'), description: error.message })
		}
	})

	return (
		// The focus ring lives on the card (focus-within), so the input itself
		// drops its own outline rather than drawing a second one inside it.
		<form
			className="border-border bg-surface focus-within:border-accent focus-within:ring-accent-glow flex items-center gap-1 rounded-xl border p-1.5 shadow-lg transition-shadow focus-within:ring-2"
			onSubmit={(event) => {
				event.preventDefault()
				if (command.trim()) parse.mutate(command)
			}}
		>
			<span className="text-accent pr-1 pl-2">
				<AiIcon size={AI_ICON_SIZE} />
			</span>
			<Input
				value={command}
				onChange={(event) => setCommand(event.target.value)}
				placeholder={t('placeholder')}
				aria-label={t('label')}
				disabled={parse.isPending}
				className="border-0 bg-transparent focus-visible:outline-none"
			/>
			<Button
				type="submit"
				disabled={parse.isPending || !command.trim()}
				className="shadow-accent-glow shrink-0 rounded-lg px-4 text-xs shadow-md"
			>
				{parse.isPending && <SpinnerIcon />}
				{t('submit')}
			</Button>
		</form>
	)
}
