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

/**
 * Type an edit in plain English; Gemini parses it, and nothing changes until
 * the user confirms the plan it shows — an AI misreading a command should
 * cost a click on Cancel, not an Undo.
 */
export function CommandBar({ durationSeconds, onTrim }: CommandBarProps) {
	const t = useTranslations('Editor.command')
	const [command, setCommand] = useState('')
	const [proposal, setProposal] = useState<{ command: string; range: TrimRange } | null>(null)

	const parse = useMutation({
		mutationFn: async (text: string) => {
			const result = await parseEditCommand({ command: text, durationSeconds })
			if (!result.ok) throw new Error(result.error)
			return result.data
		},
		onSuccess: (parsed, text) => {
			const outcome = commandToTrim(parsed, durationSeconds)
			if (outcome.ok) {
				setProposal({ command: text, range: outcome.range })
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

	function applyProposal() {
		if (!proposal) return
		onTrim(proposal.range)
		setProposal(null)
		setCommand('')
	}

	return (
		<div className="flex flex-col gap-2">
			{/* The focus ring lives on the card (focus-within), so the input itself
			    drops its own outline rather than drawing a second one inside it. */}
			<form
				className="border-border bg-surface focus-within:border-accent focus-within:ring-accent-glow flex items-center gap-1 rounded-xl border p-1.5 shadow-lg transition-shadow focus-within:ring-2"
				onSubmit={(event) => {
					event.preventDefault()
					if (!command.trim()) return
					setProposal(null)
					parse.mutate(command)
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
			{proposal && (
				<div
					role="status"
					className="border-accent/50 bg-surface flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-lg"
				>
					<div className="flex flex-col gap-0.5">
						<p className="text-text-muted text-xs">
							{t('confirm.asked', { command: proposal.command })}
						</p>
						<p className="text-text text-sm font-medium">
							{t('confirm.plan', {
								start: formatTimecode(proposal.range.startSeconds),
								end: formatTimecode(proposal.range.endSeconds),
								kept: (proposal.range.endSeconds - proposal.range.startSeconds).toFixed(1),
								removed: (
									durationSeconds -
									(proposal.range.endSeconds - proposal.range.startSeconds)
								).toFixed(1)
							})}
						</p>
					</div>
					<div className="ml-auto flex gap-2">
						<Button variant="outline" size="sm" onClick={() => setProposal(null)}>
							{t('confirm.cancel')}
						</Button>
						<Button size="sm" onClick={applyProposal}>
							{t('confirm.apply')}
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
