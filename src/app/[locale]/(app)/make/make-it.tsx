'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
	AiIcon,
	ArrowRightIcon,
	CheckIcon,
	LockIcon,
	SparkleIcon,
	SpinnerIcon,
	UploadIcon,
	VideoIcon
} from '@/components/ui/icons'
import { handOffStart } from '@/app/[locale]/editor/editor-start'
import { setSideOpen } from '@/app/[locale]/editor/editor-layout-store'
import { probeVideo } from '@/app/[locale]/editor/sources'
import { decodeAudio } from '@/app/[locale]/editor/take-audio'
import { formatTimecode } from '@/app/[locale]/editor/timeline-scale'
import type { Size } from '@/app/[locale]/editor/transform'
import { useTakeAnalysis } from '@/app/[locale]/editor/use-take-analysis'
import { VoiceCommandButton } from '@/app/[locale]/editor/voice-command-button'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { isPlainAiStatus } from '@/lib/ai-failure'
import { withTimeout } from '@/lib/with-timeout'
import { checkMakePlan, planMakeIt } from './actions'
import { clearMakeStart, peekMakeStart } from './make-start'
import { captureFrames } from './frames'
import {
	FRAME_SEPARATOR,
	frameTimes,
	MAX_MAKE_SECONDS,
	MAX_REQUEST_LENGTH,
	planMake,
	applyCheck,
	CHECK_TIMEOUT_MS,
	describePlan,
	PAGE_GRACE_MS,
	PLAN_TIMEOUT_MS,
	type CheckReply,
	type MakeAnswer,
	type MakeReply,
	type MakeSummary,
	type MusicTrack
} from './make-plan'

/** The starting points, each with its dot's colour. */
const EXAMPLES = [
	{ key: 'reel', dot: 'bg-brand-violet' },
	{ key: 'funny', dot: 'bg-brand-purple' },
	{ key: 'professional', dot: 'bg-brand-blue' },
	{ key: 'ad', dot: 'bg-brand-lilac' }
] as const
const SECONDS_PER_MINUTE = 60
/** How much of the opening line the plan quotes. */
const OPENER_WORDS = 10

/** The first `count` words of `text`, with an ellipsis when there were more. */
function firstWords(text: string, count: number): string {
	const words = text.split(/\s+/)
	return words.length > count ? `${words.slice(0, count).join(' ')}…` : text
}

/** The picked video, read: where it plays from, how long it is, its picture's size. */
type Video = { file: File; url: string; durationSeconds: number; picture: Size }
/** What's being planned: the request, and the answers to any questions asked about it. */
type Ask = { request: string; answers: MakeAnswer[] }

/** A track from public/music, fetched and decoded; null when it can't be had. */
async function loadTrack(name: string): Promise<MusicTrack<AudioBuffer> | null> {
	try {
		const response = await fetch(`/music/${encodeURIComponent(name)}`)
		if (!response.ok) return null
		const file = await response.blob()
		const buffer = await decodeAudio(file)
		return buffer ? { name, file, buffer, seconds: buffer.duration } : null
	} catch (error) {
		captureClientError(error, { feature: 'make_it_music' })
		return null
	}
}

/**
 * Asks the server for a plan. A failure comes back as what to tell the
 * user: the server's own words for a refused key, a usage limit or a busy
 * AI (written for people), `unclear` for anything else (no answer in time
 * included), which is never shown as it is. The page stops waiting a little
 * after the server's own time limit, whatever happens to the request.
 */
async function requestPlan(input: Parameters<typeof planMakeIt>[0], unclear: string) {
	let result: Awaited<ReturnType<typeof planMakeIt>>
	try {
		result = await withTimeout(PLAN_TIMEOUT_MS + PAGE_GRACE_MS, () => planMakeIt(input))
	} catch (error) {
		captureClientError(error, { feature: 'make_it' })
		throw new Error(unclear)
	}
	if (!result.ok) throw new Error(isPlainAiStatus(result.status) ? result.error : unclear)
	return result.data
}

/**
 * The second check of a plan against its request. Its failure never stops
 * the plan: it's reported, and the plan shows as first made, saying so.
 */
async function checkPlan(request: string, planText: string): Promise<CheckReply | null> {
	try {
		const result = await withTimeout(CHECK_TIMEOUT_MS + PAGE_GRACE_MS, () =>
			checkMakePlan({ request, planText })
		)
		return result.ok ? result.data : null
	} catch (error) {
		captureClientError(error, { feature: 'make_it_check' })
		return null
	}
}

/**
 * Make it: pick a video, say what it should become, and Retake plans the
 * whole edit (asking first when the request is unclear). The plan is shown
 * with Apply and Cancel; Apply opens it in the editor as one undoable step.
 */
export function MakeIt({ heading }: { heading: React.ReactNode }) {
	const t = useTranslations('Make')
	const router = useRouter()
	const inputRef = useRef<HTMLInputElement>(null)
	// A video and request handed over from the home page's Make it card, if any.
	const [file, setFile] = useState<File | null>(() => peekMakeStart()?.file ?? null)
	const [request, setRequest] = useState(() => peekMakeStart()?.request ?? '')
	const [video, setVideo] = useState<Video | null>(null)
	const [ask, setAsk] = useState<Ask | null>(null)
	const [problem, setProblem] = useState<'notVideo' | 'tooLong' | null>(null)
	const [reading, setReading] = useState(false)
	const [dragging, setDragging] = useState(false)
	const analysis = useTakeAnalysis(video)

	// Taken once: a later visit to the page starts empty.
	useEffect(() => clearMakeStart(), [])

	// The picked video's URL goes when another is picked, or with the page.
	const videoUrl = video?.url
	useEffect(() => {
		if (!videoUrl) return
		return () => URL.revokeObjectURL(videoUrl)
	}, [videoUrl])

	const frames = useQuery({
		queryKey: ['make-frames', video?.url],
		queryFn: () => (video ? captureFrames(video.url, frameTimes(video.durationSeconds)) : []),
		enabled: video !== null,
		staleTime: Infinity,
		retry: false
	})

	const transcriptState = analysis.transcript
	const transcriptReady =
		transcriptState.status === 'ready' || transcriptState.status === 'no_audio'
	const transcript = transcriptState.status === 'ready' ? transcriptState.transcript : null
	const fillerCuts = analysis.fillerPlans.flatMap((plan) =>
		plan.kind === 'cut' ? [{ startSeconds: plan.startSeconds, endSeconds: plan.endSeconds }] : []
	)

	// Kept for the session: the same request on the same video doesn't pay twice.
	const plan = useQuery({
		queryKey: ['make-plan', video?.url, ask],
		queryFn: async () => {
			if (!video || !ask || !frames.data) throw new Error('nothing to plan')
			const { reply, tracks } = await requestPlan(
				{
					request: ask.request,
					answers: ask.answers,
					durationSeconds: video.durationSeconds,
					sentences: (transcript?.segments ?? []).map(({ startSeconds, endSeconds, text }) => ({
						startSeconds,
						endSeconds,
						text
					})),
					frames: frames.data.join(FRAME_SEPARATOR)
				},
				t('errors.planning')
			)
			if (!reply) return { kind: 'none' } as const
			if (reply.questions.length > 0) {
				return { kind: 'questions', questions: reply.questions } as const
			}
			const music = reply.music ? await loadTrack(reply.music) : null
			const plan = (planned: MakeReply) =>
				planMake({
					reply: planned,
					request: ask.request,
					durationSeconds: video.durationSeconds,
					picture: video.picture,
					transcript,
					fillerCuts,
					music,
					musicAvailable: tracks.length > 0
				})
			// The plan as made, then checked against the request and made again
			// with the check's fixes, if it found anything to fix.
			const first = plan(reply)
			const check = await checkPlan(
				ask.request,
				describePlan(reply, first.summary, first.edit.clips ?? [], transcript?.segments ?? [])
			)
			const made = check && check.problems.length > 0 ? plan(applyCheck(reply, check)) : first
			return { kind: 'plan', ...made, problems: check?.problems ?? null } as const
		},
		enabled: video !== null && ask !== null && frames.data !== undefined && transcriptReady,
		staleTime: Infinity,
		retry: false
	})

	function pick(next: File) {
		setFile(next)
		setVideo(null)
		setAsk(null)
		setProblem(null)
	}

	/** Reads the video (once per pick), then asks for a plan. */
	async function start(answers: MakeAnswer[] = []) {
		if (!file || !request.trim()) return
		setProblem(null)
		if (!video) {
			setReading(true)
			const probed = await probeVideo(file)
			setReading(false)
			if (!probed) {
				setProblem('notVideo')
				return
			}
			if (probed.durationSeconds > MAX_MAKE_SECONDS) {
				URL.revokeObjectURL(probed.url)
				setProblem('tooLong')
				return
			}
			setVideo({
				file,
				url: probed.url,
				durationSeconds: probed.durationSeconds,
				picture: { width: probed.width, height: probed.height }
			})
		}
		setAsk({ request: request.trim(), answers })
	}

	function apply() {
		if (!video || plan.data?.kind !== 'plan') return
		setSideOpen('panels', true)
		handOffStart({ file: video.file, command: null, transcript, edit: plan.data.edit })
		router.push('/editor')
	}

	// Plain words for each step that can fail; never an error's own text.
	const failed =
		transcriptState.status === 'failed'
			? transcriptState.plain
				? transcriptState.error
				: t('errors.transcript')
			: frames.isError
				? t('errors.pictures')
				: plan.isError
					? plan.error.message
					: null
	const step = reading
		? t('steps.reading')
		: !transcriptReady
			? t('steps.transcript')
			: frames.data === undefined
				? t('steps.pictures')
				: t('steps.planning')

	/** The page around each stage: where it is in the three steps, the heading, then the stage. */
	const frame = (stage: Stage, content: React.ReactNode) => (
		<div className="flex flex-col items-center gap-8">
			<Steps stage={stage} />
			{heading}
			<div className="w-full">{content}</div>
		</div>
	)

	if (ask && failed) {
		return frame(
			2,
			<Card>
				<p role="alert" className="text-text text-sm">
					{failed}
				</p>
				<Button
					type="button"
					variant="outline"
					className="self-start"
					onClick={() => {
						// The video is read again, unless only the planning failed.
						if (!plan.isError) setVideo(null)
						setAsk(null)
					}}
				>
					{t('back')}
				</Button>
			</Card>
		)
	}
	if (ask && plan.data?.kind === 'questions') {
		return frame(
			1,
			<Questions
				questions={plan.data.questions}
				onAnswer={(answers) => void start(answers)}
				onCancel={() => setAsk(null)}
			/>
		)
	}
	if (ask && plan.data?.kind === 'plan') {
		return frame(
			3,
			<PlanView
				summary={plan.data.summary}
				problems={plan.data.problems}
				onApply={apply}
				onCancel={() => setAsk(null)}
			/>
		)
	}
	if (ask && plan.data?.kind === 'none') {
		return frame(
			2,
			<Card>
				<p role="alert" className="text-text text-sm">
					{t('errors.noPlan')}
				</p>
				<Button type="button" variant="outline" className="self-start" onClick={() => setAsk(null)}>
					{t('back')}
				</Button>
			</Card>
		)
	}
	if (ask || reading) {
		return frame(
			2,
			<Card>
				<p role="status" className="text-text flex items-center gap-3 text-base font-bold">
					<SpinnerIcon size={18} className="text-accent-fg" />
					{step}
				</p>
				<span aria-hidden className="bg-track relative h-1.5 overflow-hidden rounded-full">
					<span className="bg-brand-wide rt-sheen absolute inset-0 bg-size-[200%_100%] opacity-80" />
				</span>
				<p className="text-text-muted text-sm">{t('steps.note')}</p>
			</Card>
		)
	}

	return frame(
		1,
		<form
			className="flex flex-col gap-5"
			onSubmit={(event) => {
				event.preventDefault()
				void start()
			}}
		>
			<div className="from-brand-blue via-brand-violet to-brand-purple mx-auto w-full max-w-[780px] rounded-[30px] bg-linear-100 p-[3px] shadow-(--shadow-card)">
				<section
					onDragOver={(event) => {
						event.preventDefault()
						setDragging(true)
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(event) => {
						event.preventDefault()
						setDragging(false)
						const dropped = event.dataTransfer.files[0]
						if (dropped) pick(dropped)
					}}
					className={cn(
						'bg-surface-raised flex flex-col gap-4 rounded-[27px] p-[22px] transition-shadow',
						dragging && 'ring-accent-glow ring-4 ring-inset'
					)}
				>
					{file ? (
						<div className="bg-surface-hover flex flex-wrap items-center gap-4 rounded-[18px] p-3.5">
							<span className="bg-night text-accent-fg flex h-14 w-24 shrink-0 items-center justify-center rounded-xl">
								<VideoIcon size={24} />
							</span>
							<span className="text-text min-w-0 flex-1 truncate text-[15px] font-extrabold">
								{file.name}
							</span>
							<Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
								<UploadIcon />
								{t('changeVideo')}
							</Button>
						</div>
					) : (
						<button
							type="button"
							onClick={() => inputRef.current?.click()}
							className="border-border-strong hover:border-accent/60 hover:bg-accent-soft focus-visible:outline-accent flex flex-col items-center gap-2 rounded-[18px] border border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-2"
						>
							<span className="bg-accent-soft text-accent-fg flex size-12 items-center justify-center rounded-[14px]">
								<UploadIcon size={22} />
							</span>
							<span className="text-text text-[15px] font-extrabold">{t('chooseVideo')}</span>
							<span className="text-text-faint text-[13px]">{t('dropHint')}</span>
						</button>
					)}
					<input
						ref={inputRef}
						type="file"
						accept="video/*"
						className="sr-only"
						tabIndex={-1}
						aria-label={t('videoLabel')}
						onChange={(event) => {
							const picked = event.target.files?.[0]
							event.target.value = ''
							if (picked) pick(picked)
						}}
					/>
					<label htmlFor="make-request" className="text-text-muted px-1 text-[13px] font-bold">
						{t('requestLabel')}
					</label>
					<textarea
						id="make-request"
						value={request}
						onChange={(event) => setRequest(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter' && !event.shiftKey) {
								event.preventDefault()
								void start()
							}
						}}
						rows={2}
						maxLength={MAX_REQUEST_LENGTH}
						placeholder={t('placeholder')}
						className="text-text placeholder:text-text-faint -mt-2 w-full resize-none bg-transparent px-1 text-[22px] font-semibold focus-visible:outline-none"
					/>
					<div className="flex items-center gap-2">
						<VoiceCommandButton
							onText={(text) =>
								setRequest((typed) => (typed.trim() ? `${typed.trim()} ${text}` : text))
							}
						/>
						<Button
							type="submit"
							size="lg"
							className="ml-auto rounded-[14px] px-6"
							disabled={!file || !request.trim()}
						>
							<AiIcon />
							{t('makeIt')}
						</Button>
					</div>
				</section>
			</div>
			<div className="flex flex-wrap items-center justify-center gap-2">
				<span className="text-text-faint text-sm">{t('startFrom')}</span>
				{EXAMPLES.map(({ key, dot }) => (
					<button
						key={key}
						type="button"
						onClick={() => setRequest(t(`examples.${key}`))}
						className={cn(
							'focus-visible:outline-accent inline-flex h-[38px] items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-bold transition-colors focus-visible:outline-2',
							request === t(`examples.${key}`)
								? 'border-accent/60 bg-accent-soft text-accent-fg'
								: 'border-border text-text-muted hover:border-border-strong hover:text-text'
						)}
					>
						<span aria-hidden className={cn('size-[7px] rounded-full', dot)} />
						{t(`examples.${key}`)}
					</button>
				))}
			</div>
			{problem && (
				<p role="alert" className="text-danger text-center text-sm">
					{t(`errors.${problem}`, { minutes: MAX_MAKE_SECONDS / 60 })}
				</p>
			)}
			<p className="text-text-faint flex items-start justify-center gap-2 text-center text-[13px]">
				<LockIcon size={14} className="mt-0.5 shrink-0" />
				{t('steps.note')}
			</p>
		</form>
	)
}

type Stage = 1 | 2 | 3
const STAGES = ['upload', 'plans', 'review'] as const

/** Where Make it is: 1 the video and request, 2 the plan being made, 3 the plan to review. */
function Steps({ stage }: { stage: Stage }) {
	const t = useTranslations('Make.stages')
	return (
		<ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm font-bold">
			{STAGES.map((key, index) => {
				const number = index + 1
				const done = number < stage
				const current = number === stage
				return (
					<li
						key={key}
						aria-current={current ? 'step' : undefined}
						className="flex items-center gap-3"
					>
						{index > 0 && (
							<span
								aria-hidden
								className={cn(
									'hidden h-0.5 w-10 rounded-full sm:block',
									done || current ? 'bg-accent' : 'bg-border-strong'
								)}
							/>
						)}
						<span
							className={cn(
								'flex items-center gap-2',
								current || done ? 'text-text' : 'text-text-muted'
							)}
						>
							<span
								className={cn(
									'flex size-[26px] items-center justify-center rounded-full text-xs',
									current
										? 'bg-accent text-white'
										: done
											? 'bg-success/15 text-success'
											: 'border-border-strong border'
								)}
							>
								{done ? <CheckIcon size={13} /> : number}
							</span>
							{t(key)}
						</span>
					</li>
				)
			})}
		</ol>
	)
}

function Card({ children }: { children: React.ReactNode }) {
	return (
		<section className="border-glass-border bg-surface-raised mx-auto flex w-full max-w-[720px] flex-col gap-5 rounded-[28px] border p-7 shadow-(--shadow-card)">
			{children}
		</section>
	)
}

/** The questions asked before planning, each with a box for its answer. */
function Questions({
	questions,
	onAnswer,
	onCancel
}: {
	questions: readonly string[]
	onAnswer: (answers: MakeAnswer[]) => void
	onCancel: () => void
}) {
	const t = useTranslations('Make')
	const [answers, setAnswers] = useState(() => questions.map(() => ''))
	return (
		<Card>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault()
					onAnswer(questions.map((question, index) => ({ question, answer: answers[index] ?? '' })))
				}}
			>
				<h2 className="text-text text-[25px] font-extrabold tracking-[-0.02em]">
					{t('questions.title')}
				</h2>
				{questions.map((question, index) => (
					<label key={question} className="flex flex-col gap-1.5">
						<span className="text-text text-sm font-bold">{question}</span>
						<input
							value={answers[index] ?? ''}
							onChange={(event) =>
								setAnswers((all) => all.map((a, i) => (i === index ? event.target.value : a)))
							}
							maxLength={MAX_REQUEST_LENGTH}
							className="border-border-strong bg-surface-inset text-text focus-visible:border-accent/60 focus-visible:ring-accent-soft h-12 rounded-[14px] border px-4 text-base focus-visible:ring-4 focus-visible:outline-none"
						/>
					</label>
				))}
				<div className="flex gap-2">
					<Button type="submit">{t('questions.submit')}</Button>
					<Button type="button" variant="outline" onClick={onCancel}>
						{t('cancel')}
					</Button>
				</div>
			</form>
		</Card>
	)
}

const DOTS = ['bg-brand-violet', 'bg-brand-purple', 'bg-brand-blue', 'bg-brand-lilac'] as const

/** The plan in plain words, with Apply and Cancel. */
function PlanView({
	summary,
	problems,
	onApply,
	onCancel
}: {
	summary: MakeSummary
	/** What the second check fixed: none, or null when it couldn't run. */
	problems: string[] | null
	onApply: () => void
	onCancel: () => void
}) {
	const t = useTranslations('Make.plan')
	// Rounded once, so the headline and the times below agree.
	const seconds = Math.round(summary.editedSeconds)
	const length =
		seconds < SECONDS_PER_MINUTE
			? t('duration.seconds', { count: seconds })
			: t('duration.minutes', {
					minutes: Math.floor(seconds / SECONDS_PER_MINUTE),
					seconds: seconds % SECONDS_PER_MINUTE
				})
	const shortened = summary.removedParts > 0 || summary.fillerCuts > 0
	const lines = [
		shortened
			? t('shortened', {
					from: formatTimecode(summary.originalSeconds),
					to: formatTimecode(seconds)
				})
			: t('whole', { length: formatTimecode(seconds) }),
		...(summary.keptSentences < summary.totalSentences
			? [t('keptSentences', { kept: summary.keptSentences, total: summary.totalSentences })]
			: []),
		...(summary.fillerCuts > 0 ? [t('fillers', { count: summary.fillerCuts })] : []),
		...(summary.limitSeconds === null ? [] : [t(summary.trimmedToFit ? 'fitCut' : 'fitOk')]),
		...(summary.opensWith
			? [t('opensWith', { line: firstWords(summary.opensWith, OPENER_WORDS) })]
			: []),
		t(`captions.${summary.captions}`),
		...(summary.keyLines > 0 ? [t('keyLines', { count: summary.keyLines })] : []),
		...(summary.zooms > 0 ? [t('zooms', { count: summary.zooms })] : []),
		...(summary.transitions > 0
			? [t(`transitions.${summary.transition}`, { count: summary.transitions })]
			: []),
		summary.music
			? t('music', { name: summary.music })
			: summary.musicMissing
				? t('noMusicFolder')
				: t('noMusic'),
		...(summary.vertical
			? [
					t(
						`vertical.${summary.vertical === 'designed' && summary.card === 'hidden' ? 'designedHidden' : summary.vertical}`
					)
				]
			: []),
		...(summary.title ? [t('title', { text: summary.title })] : []),
		...(summary.titleDropped ? [t('titleDropped')] : []),
		...(summary.pictureMatters ? [] : [t('speechOnly')])
	]
	return (
		<section
			role="status"
			aria-label={t('label')}
			className="border-glass-border bg-surface-raised mx-auto flex w-full max-w-[720px] flex-col gap-5 rounded-[28px] border p-7 shadow-(--shadow-card)"
		>
			<div className="flex items-center justify-between gap-3">
				<span className="text-accent-fg flex items-center gap-1.5 text-xs font-extrabold tracking-[0.14em] uppercase">
					<SparkleIcon size={13} />
					{t('label')}
				</span>
				<span className="bg-surface-hover text-text-muted rounded-full px-3 py-1 text-xs font-bold">
					{t('notApplied')}
				</span>
			</div>
			<div className="flex flex-col gap-1.5">
				<h2 className="text-text text-[clamp(24px,3vw,30px)] leading-tight font-extrabold tracking-[-0.02em]">
					{t(`making.${summary.making}`, { length })}
				</h2>
				<p className="text-text-muted text-[15px]">{summary.summary}</p>
			</div>
			<ul className="grid gap-2 sm:grid-cols-2">
				{lines.map((line, index) => (
					<li
						key={line}
						className="border-border bg-surface-inset text-text flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-snug"
					>
						<span
							aria-hidden
							className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', DOTS[index % DOTS.length])}
						/>
						{line}
					</li>
				))}
			</ul>
			<div
				className={cn(
					'flex flex-col gap-1 rounded-2xl p-4',
					problems === null ? 'bg-surface-inset' : 'bg-success/10'
				)}
			>
				<p
					className={cn(
						'flex items-center gap-1.5 text-sm font-extrabold',
						problems === null ? 'text-text' : 'text-success'
					)}
				>
					{problems !== null && <CheckIcon size={14} />}
					{problems === null
						? t('check.failed')
						: problems.length === 0
							? t('check.ok')
							: t('check.fixed')}
				</p>
				{problems && problems.length > 0 && (
					<ul className="text-text-muted list-disc pl-5 text-sm">
						{problems.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				)}
			</div>
			{summary.cannotDo.length > 0 && (
				<div className="border-border bg-surface-inset flex flex-col gap-1 rounded-2xl border p-4">
					<p className="text-text text-sm font-extrabold">{t('cannotDo')}</p>
					<ul className="text-text-muted list-disc pl-5 text-sm">
						{summary.cannotDo.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</div>
			)}
			<div className="flex flex-wrap gap-2">
				<Button type="button" size="lg" className="rounded-[14px]" onClick={onApply}>
					{t('apply')}
					<ArrowRightIcon />
				</Button>
				<Button
					type="button"
					size="lg"
					variant="outline"
					className="rounded-[14px]"
					onClick={onCancel}
				>
					{t('cancel')}
				</Button>
			</div>
		</section>
	)
}
