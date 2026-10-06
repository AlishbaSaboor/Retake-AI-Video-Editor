'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { DownloadIcon, HighlightIcon, SpinnerIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { findHighlights } from './actions'
import { NEUTRAL_GRADE } from './color-grade'
import { useVideoExport } from './export-button'
import { planHighlights, type Highlight } from './highlights'
import type { Overlays } from './overlays'
import { DEFAULT_TEXT_STYLE } from './text-style'
import { formatTimecode } from './timeline-scale'
import {
	aspectRatio,
	centredCrop,
	IDENTITY_TRANSFORM,
	type PictureTransform,
	type Size
} from './transform'
import type { TranscriptSegment } from './transcript'
import type { TranscriptState } from './use-take-analysis'

// A downloaded highlight is the moment of the original video as it was
// recorded: none of the edit's text, graphics, colour or sound changes.
const NO_OVERLAYS: Overlays = {
	title: null,
	watermark: null,
	captions: [],
	captionStyle: DEFAULT_TEXT_STYLE,
	annotations: [],
	lowerThird: null,
	zoom: null
}
const VERTICAL = '9:16'
/** How far past a moment's end playback may run before it's stopped there. */
const END_TOLERANCE_SECONDS = 0.05

type Source = { url: string; name: string; durationSeconds: number; picture: Size }

/** A source time as the dialog shows it: "0:12 – 0:31". */
const span = (highlight: Highlight) =>
	`${formatTimecode(highlight.startSeconds)} – ${formatTimecode(highlight.endSeconds)}`

/** The Find highlights tool's panel: what it does, and the button that opens the pop-up. */
export function HighlightsPanel({ onOpen }: { onOpen: () => void }) {
	const t = useTranslations('Editor.highlights')
	return (
		<section aria-label={t('title')} className="flex flex-col gap-3">
			<p className="text-text-muted text-sm leading-relaxed">{t('panel')}</p>
			<Button onClick={onOpen} className="self-start">
				<HighlightIcon />
				{t('open')}
			</Button>
		</section>
	)
}

/**
 * The highlights pop-up: the take's best moments, as cards to watch and
 * download. Picking a card plays its moment; each card's Download records
 * just that moment of the original video to a file, cropped to 9:16 when
 * that box is ticked. Nothing here changes the edit or its timeline — it
 * has a Close button and no Apply. Mounted while open.
 */
export function HighlightsDialog({
	source,
	transcript,
	onClose
}: {
	source: Source
	transcript: TranscriptState
	onClose: () => void
}) {
	const t = useTranslations('Editor.highlights')
	const [picked, setPicked] = useState<number | null>(null)
	const [vertical, setVertical] = useState(false)
	const [downloading, setDownloading] = useState<number | null>(null)
	const sentences: readonly TranscriptSegment[] =
		transcript.status === 'ready' ? transcript.transcript.segments : []
	const highlights = useQuery({
		// Kept for the session, so opening the pop-up again doesn't pay for the moments twice.
		queryKey: ['highlights', source.url],
		queryFn: async () => {
			const result = await findHighlights({
				sentences: sentences.map(({ startSeconds, endSeconds, text }) => ({
					startSeconds,
					endSeconds,
					text
				}))
			})
			if (!result.ok) throw new Error(result.error)
			return planHighlights(sentences, result.data, source.durationSeconds)
		},
		enabled: sentences.length > 0,
		staleTime: Infinity,
		gcTime: Infinity,
		retry: false
	})
	const ratio = aspectRatio(VERTICAL)
	const transform: PictureTransform =
		vertical && ratio
			? {
					...IDENTITY_TRANSFORM,
					crop: { aspect: VERTICAL, rect: centredCrop(ratio, source.picture) }
				}
			: IDENTITY_TRANSFORM
	const moments = highlights.data ?? []
	const playing = picked === null ? undefined : moments[picked]

	let body: React.ReactNode
	if (transcript.status !== 'ready') {
		body = <Notice>{t(`noTranscript.${transcript.status}`)}</Notice>
	} else if (sentences.length === 0) {
		body = <Notice>{t('noTranscript.empty')}</Notice>
	} else if (highlights.isPending) {
		body = (
			<p role="status" className="text-text-muted flex items-center gap-2 py-10 text-sm">
				<SpinnerIcon />
				{t('finding')}
			</p>
		)
	} else if (highlights.isError) {
		body = (
			<div role="alert" className="flex flex-col items-start gap-3 py-6">
				<p className="text-text text-sm">{t('failed')}</p>
				<p className="text-text-muted text-sm">{highlights.error.message}</p>
				<Button variant="outline" size="sm" onClick={() => void highlights.refetch()}>
					{t('retry')}
				</Button>
			</div>
		)
	} else if (moments.length === 0) {
		body = <Notice>{t('none')}</Notice>
	} else {
		body = (
			<div className="flex flex-col gap-4">
				{playing && (
					<div className="flex flex-col gap-1">
						<video
							key={`${playing.startSeconds}-${playing.endSeconds}`}
							src={`${source.url}#t=${playing.startSeconds},${playing.endSeconds}`}
							aria-label={t('player', { title: playing.title })}
							data-highlight-player
							controls
							autoPlay
							playsInline
							className="aspect-video max-h-[40vh] w-full rounded-md bg-black object-contain"
							onPlay={(event) => {
								const video = event.currentTarget
								// Played again from its end, or sought out of it: from its start.
								if (
									video.currentTime >= playing.endSeconds - END_TOLERANCE_SECONDS ||
									video.currentTime < playing.startSeconds
								) {
									video.currentTime = playing.startSeconds
								}
							}}
							onTimeUpdate={(event) => {
								const video = event.currentTarget
								if (video.currentTime > playing.endSeconds + END_TOLERANCE_SECONDS) {
									video.pause()
									video.currentTime = playing.endSeconds
								}
							}}
						/>
						<p className="text-text-muted text-xs">
							{playing.title} · {span(playing)}
						</p>
					</div>
				)}
				<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{moments.map((highlight, index) => (
						<HighlightCard
							key={`${highlight.startSeconds}-${highlight.endSeconds}`}
							highlight={highlight}
							number={index + 1}
							source={source}
							transform={transform}
							picked={picked === index}
							onPick={() => setPicked(index)}
							blocked={downloading !== null && downloading !== index}
							onDownload={async (start) => {
								setDownloading(index)
								await start()
								setDownloading(null)
							}}
						/>
					))}
				</ul>
			</div>
		)
	}

	return (
		<div
			className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
			onKeyDown={(event) => {
				if (event.key === 'Escape') onClose()
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="highlights-title"
				aria-describedby="highlights-description"
				className="border-border bg-surface text-text flex max-h-full w-[min(56rem,100%)] flex-col rounded-lg border shadow-2xl"
			>
				<div className="flex flex-col gap-1 px-5 pt-5 pb-3">
					<h2 id="highlights-title" className="font-display text-lg font-semibold">
						{t('title')}
					</h2>
					<p id="highlights-description" className="text-text-muted text-sm">
						{t('description')}
					</p>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{body}</div>
				<div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
					<label className="text-text flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={vertical}
							disabled={downloading !== null}
							onChange={(event) => setVertical(event.currentTarget.checked)}
							className="accent-accent size-4"
						/>
						{t('vertical')}
					</label>
					<Button variant="outline" autoFocus onClick={onClose}>
						{t('close')}
					</Button>
				</div>
			</div>
		</div>
	)
}

function Notice({ children }: { children: React.ReactNode }) {
	return (
		<p role="status" className="text-text-muted max-w-prose py-6 text-sm leading-relaxed">
			{children}
		</p>
	)
}

/** One moment: a muted preview that plays while pointed at, its title and line, and its Download. */
function HighlightCard({
	highlight,
	number,
	source,
	transform,
	picked,
	onPick,
	blocked,
	onDownload
}: {
	highlight: Highlight
	number: number
	source: Source
	transform: PictureTransform
	picked: boolean
	onPick: () => void
	/** Another moment is downloading: one at a time, as each plays through to record. */
	blocked: boolean
	onDownload: (start: () => Promise<void>) => Promise<void>
}) {
	const t = useTranslations('Editor.highlights')
	const exporter = useVideoExport({
		videoUrl: source.url,
		videoName: source.name,
		segments: [{ startSeconds: highlight.startSeconds, endSeconds: highlight.endSeconds }],
		overlays: NO_OVERLAYS,
		transform,
		color: NEUTRAL_GRADE,
		laneItems: [],
		addedUrls: {},
		fileLabel: `highlight-${number}`
	})
	const seconds = Math.round(highlight.endSeconds - highlight.startSeconds)

	return (
		<li
			className={cn(
				'border-border bg-surface-inset flex flex-col overflow-hidden rounded-lg border',
				picked && 'border-accent ring-accent ring-1'
			)}
		>
			<button
				type="button"
				aria-pressed={picked}
				onClick={onPick}
				onPointerEnter={(event) => {
					const preview = event.currentTarget.querySelector('video')
					if (preview) void preview.play().catch(() => {})
				}}
				onPointerLeave={(event) => {
					const preview = event.currentTarget.querySelector('video')
					if (!preview) return
					preview.pause()
					preview.currentTime = highlight.startSeconds
				}}
				className="hover:bg-surface-hover focus-visible:outline-accent flex flex-1 flex-col text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
			>
				<video
					src={`${source.url}#t=${highlight.startSeconds},${highlight.endSeconds}`}
					muted
					playsInline
					preload="metadata"
					aria-hidden
					tabIndex={-1}
					data-highlight-preview
					className="pointer-events-none aspect-video w-full bg-black object-contain"
					onTimeUpdate={(event) => {
						const preview = event.currentTarget
						// Loops the moment while pointed at.
						if (preview.currentTime >= highlight.endSeconds)
							preview.currentTime = highlight.startSeconds
					}}
				/>
				<span className="flex flex-col gap-1 p-3">
					<span className="text-text text-sm font-semibold">{highlight.title}</span>
					<span className="text-text-muted text-xs leading-relaxed">{highlight.description}</span>
					<span className="text-text-faint font-mono text-[11px]">
						{span(highlight)} · {t('seconds', { seconds })}
					</span>
				</span>
			</button>
			<div className="border-border flex items-center gap-2 border-t px-3 py-2">
				{exporter.percent === null ? (
					<Button
						variant="outline"
						size="sm"
						disabled={blocked || !exporter.canStart}
						aria-label={t('download', { title: highlight.title })}
						onClick={() => void onDownload(exporter.start)}
					>
						<DownloadIcon />
						{t('downloadShort')}
					</Button>
				) : (
					<>
						<span role="status" className="text-text-muted text-xs">
							{t('downloading', { percent: exporter.percent })}
						</span>
						<Button variant="ghost" size="sm" onClick={exporter.cancel}>
							{t('cancel')}
						</Button>
					</>
				)}
			</div>
		</li>
	)
}
