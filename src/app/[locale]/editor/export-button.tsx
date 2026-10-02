'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { DownloadIcon } from '@/components/ui/icons'
import { toast } from '@/lib/toast'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { canExport, exportFileName, recordEdit, totalSeconds } from './export-video'
import type { Overlays } from './overlays'
import type { ReplacementTake } from './re-record'
import type { Segment } from './sequence'

type ExportSource = {
	videoUrl: string
	videoName: string
	/** What the edit plays, in order — captured when the export starts. */
	segments: Segment<ReplacementTake>[]
	overlays: Overlays
}

const PERCENT = 100

function download(blob: Blob, fileName: string) {
	const href = URL.createObjectURL(blob)
	Object.assign(document.createElement('a'), { href, download: fileName }).click()
	// Revoked once the click has handed the file to the browser's download.
	setTimeout(() => URL.revokeObjectURL(href))
}

/**
 * Records the edit to a real video file and downloads it: `start` begins,
 * `percent` is how far it's got (null when idle), `cancel` stops it. Shared
 * by the Export button and the typed "export" command.
 */
export function useVideoExport({ videoUrl, videoName, segments, overlays }: ExportSource) {
	const t = useTranslations('Editor.export')
	const [percent, setPercent] = useState<number | null>(null)
	const controllerRef = useRef<AbortController | null>(null)
	useEffect(() => () => controllerRef.current?.abort(), [])

	async function start() {
		if (!canExport()) {
			toast({
				variant: 'destructive',
				title: t('unsupported.title'),
				description: t('unsupported.description')
			})
			return
		}
		const controller = new AbortController()
		controllerRef.current = controller
		setPercent(0)
		try {
			const { blob, mimeType } = await recordEdit(videoUrl, segments, overlays, {
				onProgress: (fraction) => setPercent(Math.floor(fraction * PERCENT)),
				signal: controller.signal
			})
			const fileName = exportFileName(videoName, mimeType)
			download(blob, fileName)
			toast({ title: t('done.title'), description: t('done.description', { name: fileName }) })
		} catch (error) {
			if (!controller.signal.aborted) {
				const { userMessage } = captureClientError(error, { feature: 'export' })
				toast({ variant: 'destructive', title: t('failed'), description: userMessage })
			}
		}
		setPercent(null)
	}

	return {
		percent,
		start,
		cancel: () => controllerRef.current?.abort(),
		canStart: percent === null && totalSeconds(segments) > 0
	}
}

/** The export's button: progress and Cancel while it runs. */
export function ExportButton({ exporter }: { exporter: ReturnType<typeof useVideoExport> }) {
	const t = useTranslations('Editor.export')
	if (exporter.percent !== null) {
		return (
			<div role="status" className="flex items-center gap-2">
				<span className="text-text-muted text-xs">
					{t('progress', { percent: exporter.percent })}
				</span>
				<Button variant="outline" size="sm" onClick={exporter.cancel}>
					{t('cancel')}
				</Button>
			</div>
		)
	}
	return (
		<Button
			variant="outline"
			size="sm"
			title={t('hint')}
			disabled={!exporter.canStart}
			onClick={exporter.start}
		>
			<DownloadIcon />
			{t('button')}
		</Button>
	)
}
