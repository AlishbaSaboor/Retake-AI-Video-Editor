'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { RedoIcon, ResetIcon, UndoIcon } from '@/components/ui/icons'

/**
 * Undo and Redo step back and forth through every edit; Reset to original
 * removes them all as one step, after asking, since it takes out so much at
 * once. Each shows only when there's something for it to do.
 */
export function HistoryControls({
	canUndo,
	canRedo,
	canReset,
	onUndo,
	onRedo,
	onReset
}: {
	canUndo: boolean
	canRedo: boolean
	/** Whether the edit differs from the take as uploaded. */
	canReset: boolean
	onUndo: () => void
	onRedo: () => void
	onReset: () => void
}) {
	const t = useTranslations('Editor.cleanup')
	const [isConfirmingReset, setIsConfirmingReset] = useState(false)

	return (
		<div className="relative flex items-center gap-1">
			{canUndo && (
				<Button
					variant="ghost"
					size="icon"
					aria-label={t('undo')}
					title={`${t('undo')} (Ctrl+Z)`}
					aria-keyshortcuts="Control+Z"
					onClick={onUndo}
				>
					<UndoIcon size={18} />
				</Button>
			)}
			{canRedo && (
				<Button
					variant="ghost"
					size="icon"
					aria-label={t('redo')}
					title={`${t('redo')} (Ctrl+Shift+Z)`}
					aria-keyshortcuts="Control+Shift+Z Control+Y"
					onClick={onRedo}
				>
					<RedoIcon size={18} />
				</Button>
			)}
			{canReset && (
				<Button
					variant="ghost"
					size="sm"
					aria-label={t('reset')}
					aria-expanded={isConfirmingReset}
					onClick={() => setIsConfirmingReset(!isConfirmingReset)}
				>
					<ResetIcon />
					{t('resetShort')}
				</Button>
			)}
			{isConfirmingReset && (
				<div
					role="status"
					className="border-border bg-surface absolute top-full right-0 z-30 mt-2 flex w-80 flex-col gap-3 rounded-lg border p-4 shadow-xl"
				>
					<p className="text-text text-sm">{t('resetConfirm')}</p>
					<div className="flex justify-end gap-2">
						<Button variant="outline" size="sm" onClick={() => setIsConfirmingReset(false)}>
							{t('cancel')}
						</Button>
						<Button
							size="sm"
							onClick={() => {
								onReset()
								setIsConfirmingReset(false)
							}}
						>
							{t('resetApply')}
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
