'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { DownloadIcon } from '@/components/ui/icons'
import { toast } from '@/lib/toast'
import { captureClientError } from '@/lib/observability/capture-client-error'
import {
	canExport,
	exportFileName,
	fileSeconds,
	lengthMismatch,
	recordEdit,
	totalSeconds
} from './export-video'
import type { Overlays } from './overlays'
import type { ReplacementTake } from './re-record'
import type { Segment, SourceRange } from './sequence'
import type { AudioItem } from './audio-lane'
import type { ColorGrade } from './color-grade'
import type { PictureTransform } from './transform'

type ExportSource = {
	videoUrl: string
	videoName: string
	/** What the edit plays, in order — captured when the export starts. */
	segments: Segment<ReplacementTake>[]
	overlays: Overlays
	transform: PictureTransform
	/** The whole video's color adjustments. */
	color: ColorGrade
	/** The Audio lane's sounds. */
	laneItems: AudioItem[]
	/** Where someone speaks, in edited time: ducked music goes down under it. */
	speech?: SourceRange[]
	/** Where each added video plays from, by id. */
	addedUrls: Readonly<Record<string, string>>
	/** What the file's name says it is, after the video's own name; "edited" unless given. */
	fileLabel?: string
}

const PERCENT = 100
const NO_SPEECH: SourceRange[] = []

function download(blob: Blob, fileName: string) {
	const href = URL.createObjectURL(blob)
	Object.assign(document.createElement('a'), { href, download: fileName }).click()
	// Revoked once the click has handed the file to the browser's download.
	setTimeout(() => URL.revokeObjectURL(href))
}

/**
 * How far the exported file's length is off the edit's (`lengthMismatch`).
 * Null too when it can't be measured: that is reported, and the export,
 * already downloading, is left to stand.
 */
async function measuredMismatch(blob: Blob, editSeconds: number): Promise<number | null> {
	try {
		return lengthMismatch(await fileSeconds(blob), editSeconds)
	} catch (error) {
		captureClientError(error, { feature: 'export_length' })
		return null
	}
}

/** The wrong-length message's values: "0.4" and "long" for a file 0.4 s too long. */
function describeMismatch(off: number) {
	return { seconds: Math.abs(off).toFixed(1), direction: off > 0 ? 'long' : 'short' }
}

/**
 * Records the edit to a real video file and downloads it, warning when the
 * file came out a different length from the edit: `start` begins,
 * `percent` is how far it's got (null when idle), `cancel` stops it. Shared
 * by the Export button and the typed "export" command.
 */
export function useVideoExport({
	videoUrl,
	videoName,
	segments,
	overlays,
	transform,
	color,
	laneItems,
	speech = NO_SPEECH,
	addedUrls,
	fileLabel
}: ExportSource) {
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
			const { blob, mimeType } = await recordEdit(
				{ main: videoUrl, added: addedUrls },
				segments,
				overlays,
				transform,
				color,
				laneItems,
				speech,
				{
					onProgress: (fraction) => setPercent(Math.floor(fraction * PERCENT)),
					signal: controller.signal
				}
			)
			const fileName = exportFileName(videoName, mimeType, fileLabel)
			download(blob, fileName)
			setPercent(null)
			const off = await measuredMismatch(blob, totalSeconds(segments))
			// Statements, not a conditional expression: the React Compiler
			// doesn't support those inside try/catch yet.
			if (off === null) {
				toast({ title: t('done') })
			} else {
				toast({
					variant: 'destructive',
					title: t('wrongLength.title', { name: fileName }),
					description: t('wrongLength.description', describeMismatch(off))
				})
			}
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
				<span className="flex flex-col gap-1">
					<span className="text-text-muted text-xs">
						{t('progress', { percent: exporter.percent })}
					</span>
					<span aria-hidden className="bg-surface-inset h-1 w-28 overflow-hidden rounded-full">
						<span
							className="bg-accent block h-full rounded-full transition-[width]"
							style={{ width: `${exporter.percent}%` }}
						/>
					</span>
				</span>
				<Button variant="outline" size="sm" onClick={exporter.cancel}>
					{t('cancel')}
				</Button>
			</div>
		)
	}
	return (
		<Button
			size="sm"
			title={t('hint')}
			aria-label={t('button')}
			disabled={!exporter.canStart}
			onClick={exporter.start}
		>
			<DownloadIcon />
			{t('short')}
		</Button>
	)
}
