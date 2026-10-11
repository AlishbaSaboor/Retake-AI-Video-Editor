'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
	AiIcon,
	AlertIcon,
	ArrowRightIcon,
	AttachIcon,
	CaptionsIcon,
	CropIcon,
	MusicIcon,
	TextIcon,
	TimingIcon,
	VideoIcon,
	ManualIcon,
	CheckIcon,
	LockIcon,
	SparkleIcon,
	SpinnerIcon,
	UploadIcon
} from '@/components/ui/icons'
import { handOffStart } from '@/app/[locale]/editor/projects/editor-start'
import { setSideOpen } from '@/app/[locale]/editor/components/shell/editor-layout-store'
import { probeVideo } from '@/app/[locale]/editor/model/sources'
import { formatTimecode } from '@/app/[locale]/editor/model/timeline-scale'
import type { Size } from '@/app/[locale]/editor/model/transform'
import { useTakeAnalysis } from '@/app/[locale]/editor/audio/use-take-analysis'
import { VoiceCommandButton } from '@/app/[locale]/editor/components/assistant/voice-command-button'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { isPlainAiStatus } from '@/lib/ai-failure'
import { withTimeout } from '@/lib/with-timeout'
import { checkMakePlan, planMakeIt } from './actions'
import { clearMakeStart, peekMakeStart } from './make-start'
import { loadTrack } from './music-track'
import { captureFrames } from './frames'
import {
	FRAME_SEPARATOR,
	frameTimes,
	MAX_ANSWER_LENGTH,
	MAX_MAKE_SECONDS,
	MAX_REQUEST_LENGTH,
	planMake,
	applyCheck,
	checkFound,
	CHECK_TIMEOUT_MS,
	describePlan,
	PAGE_GRACE_MS,
	PLAN_TIMEOUT_MS,
	type BriefPart,
	type CheckReply,
	type MakeAnswer,
	type MakeReply,
	type MakeSummary
} from './make-plan'
import { questionsToAsk, type MakeChoices, type QuestionId } from './make-questions'
import { QuickQuestions } from './quick-questions'

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
/**
 * What's being planned: the request, the answers to the quick questions
 * (null when none were shown), and the answers to any Gemini asked.
 */
type Ask = { request: string; choices: MakeChoices | null; answers: MakeAnswer[] }

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
async function checkPlan(
	request: string,
	choices: MakeChoices | null,
	planText: string
): Promise<CheckReply | null> {
	try {
		const result = await withTimeout(CHECK_TIMEOUT_MS + PAGE_GRACE_MS, () =>
			checkMakePlan({ request, ...(choices && { choices }), planText })
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
	// The quick questions on screen for the request, if any: planning waits for them.
	const [asking, setAsking] = useState<{ request: string; shown: QuestionId[] } | null>(null)
	const [problem, setProblem] = useState<'notVideo' | 'tooLong' | null>(null)
	const [reading, setReading] = useState(false)
	const [dragging, setDragging] = useState(false)
	const analysis = useTakeAnalysis(video)
	// Past the limit, the request is kept as typed and Make it waits for it to be shortened.
	const overLimit = request.length > MAX_REQUEST_LENGTH

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
					...(ask.choices && { choices: ask.choices }),
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
			const plan = (
				planned: MakeReply,
				tooShort: { keepOut: number[] } | null = null,
				unchecked = false
			) =>
				planMake({
					reply: planned,
					request: ask.request,
					durationSeconds: video.durationSeconds,
					picture: video.picture,
					transcript,
					fillerCuts,
					music,
					musicAvailable: tracks.length > 0,
					tooShort,
					unchecked,
					choices: ask.choices
				})
			const musicAvailable = tracks.length > 0
			// The plan as made, then checked against the request and made again
			// with the check's fixes, if it found anything to fix (lengthened,
			// when it found the edit too short); made again unchecked when the
			// check couldn't run (a screen recording then shows whole).
			const first = plan(reply)
			const check = await checkPlan(
				ask.request,
				ask.choices,
				describePlan(reply, first.summary, first.edit.clips ?? [], transcript?.segments ?? [])
			)
			const made =
				check === null
					? plan(reply, null, true)
					: checkFound(check)
						? plan(
								applyCheck(reply, check),
								check.tooShort ? { keepOut: check.dropSentences } : null
							)
						: first
			return {
				kind: 'plan',
				...made,
				music,
				musicAvailable,
				problems: check?.problems ?? null
			} as const
		},
		enabled: video !== null && ask !== null && frames.data !== undefined && transcriptReady,
		staleTime: Infinity,
		retry: false
	})

	function pick(next: File) {
		setFile(next)
		setVideo(null)
		setAsk(null)
		setAsking(null)
		setProblem(null)
	}

	/**
	 * Reads the video (once per pick), then shows the quick questions the
	 * request leaves open, or plans straight away when it answers them all.
	 * The video is read and transcribed while they're answered; planning
	 * waits for the answers, or Skip all.
	 */
	async function start() {
		const text = request.trim()
		if (!file || !text || overLimit) return
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
		const shown = questionsToAsk(text)
		if (shown.length > 0) setAsking({ request: text, shown })
		else setAsk({ request: text, choices: null, answers: [] })
	}

	/** The quick questions answered (each left to "You decide" is Retake's): plan now. */
	function answered(choices: MakeChoices) {
		if (!asking) return
		setAsking(null)
		setAsk({ request: asking.request, choices, answers: [] })
	}

	/**
	 * Opens the plan in the editor, as one undoable step: with only the chat
	 * beside the video (Apply), or straight into the full editor (Edit manually).
	 */
	function apply(lines: string[], manual: boolean) {
		if (!video || !ask || plan.data?.kind !== 'plan') return
		setSideOpen('panels', true)
		handOffStart({
			file: video.file,
			command: null,
			transcript,
			edit: plan.data.edit,
			byHand: manual,
			studio: manual
				? undefined
				: {
						request: ask.request,
						lines,
						editedSeconds: plan.data.summary.editedSeconds,
						originalSeconds: plan.data.summary.originalSeconds,
						// For follow-ups in the chat: the plan as applied, and what it was made from.
						plan: {
							reply: plan.data.used,
							summary: plan.data.summary,
							edit: plan.data.edit,
							music: plan.data.music
						},
						basis: {
							request: ask.request,
							choices: ask.choices,
							durationSeconds: video.durationSeconds,
							picture: video.picture,
							fillerCuts,
							musicAvailable: plan.data.musicAvailable
						}
					}
		})
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
	const frame = (stage: Stage, content: React.ReactNode) =>
		stage === 3 ? (
			// The plan, as the mockup has it: the video on the left, the plan beside it.
			<div className="flex flex-col items-center gap-7">
				<Steps stage={stage} />
				<div className="sr-only">{heading}</div>
				<div className="flex w-full flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
					<Preview video={video} />
					<div className="w-full max-w-[560px]">{content}</div>
				</div>
			</div>
		) : (
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
				onAnswer={(answers) => setAsk({ ...ask, answers })}
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
				onApply={(lines) => apply(lines, false)}
				onManual={(lines) => apply(lines, true)}
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
	if (asking) {
		return frame(
			1,
			<Card>
				<QuickQuestions
					request={asking.request}
					onDone={answered}
					onCancel={() => setAsking(null)}
				/>
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
						<AttachedVideo
							key={`${file.name}|${file.size}|${file.lastModified}`}
							file={file}
							onReplace={() => inputRef.current?.click()}
						/>
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
						aria-describedby="make-request-count"
						aria-invalid={overLimit}
						placeholder={t('placeholder')}
						className="text-text placeholder:text-text-faint -mt-2 w-full resize-none bg-transparent px-1 text-[22px] font-semibold focus-visible:outline-none"
					/>
					<p
						id="make-request-count"
						role={overLimit ? 'alert' : undefined}
						className={cn(
							'-mt-2 px-1 text-[12.5px]',
							overLimit ? 'text-danger font-bold' : 'text-text-faint'
						)}
					>
						{overLimit
							? t('requestOver', {
									count: request.length - MAX_REQUEST_LENGTH,
									max: MAX_REQUEST_LENGTH
								})
							: t('requestLeft', { count: MAX_REQUEST_LENGTH - request.length })}
					</p>
					<div className="flex items-center gap-2">
						<button
							type="button"
							aria-label={t('attach')}
							title={t('attach')}
							onClick={() => inputRef.current?.click()}
							className="border-border-strong text-text-muted hover:text-text hover:bg-surface-hover focus-visible:outline-accent flex size-10 items-center justify-center rounded-[12px] border transition-colors focus-visible:outline-2"
						>
							<AttachIcon size={17} />
						</button>
						<VoiceCommandButton
							onText={(text) =>
								setRequest((typed) => (typed.trim() ? `${typed.trim()} ${text}` : text))
							}
						/>
						<Button
							type="submit"
							size="lg"
							className="ml-auto rounded-[14px] px-6"
							disabled={!file || !request.trim() || overLimit}
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
							maxLength={MAX_ANSWER_LENGTH}
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

/** The plan card's rows, in the mockup's order, each with its icon. */
type PlanRow = 'length' | 'shape' | 'captions' | 'screen' | 'motion' | 'music'
const PLAN_ROWS: { key: PlanRow; icon: (props: { size?: number }) => React.ReactNode }[] = [
	{ key: 'length', icon: TimingIcon },
	{ key: 'shape', icon: CropIcon },
	{ key: 'captions', icon: CaptionsIcon },
	{ key: 'screen', icon: TextIcon },
	{ key: 'motion', icon: VideoIcon },
	{ key: 'music', icon: MusicIcon }
]

/** The plan in plain words, with Apply and Cancel. */
function PlanView({
	summary,
	problems,
	onApply,
	onManual,
	onCancel
}: {
	summary: MakeSummary
	/** What the second check fixed: none, or null when it couldn't run. */
	problems: string[] | null
	/** Each gets the plan's lines, to show again over the chat in the editor. */
	onApply: (lines: string[]) => void
	onManual: (lines: string[]) => void
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

	/** The Shape row: the shape and how the video goes into it, then why. */
	function shapeLines({ shape, card, screen }: MakeSummary): string[] {
		const name = t(`shape.names.${shape.target}`)
		// A screen recording: its treatment, then why.
		if (screen) {
			const how =
				screen.treatment === 'designed'
					? t('shape.screenDesigned', { shape: name })
					: shape.how === 'whole'
						? t(shape.fit === 'blur' ? 'shape.blur' : 'shape.bars', { shape: name })
						: shape.how === 'matches'
							? t('shape.matches', { shape: name })
							: t('shape.kept')
			return [how, t(`shape.screenWhy.${screen.treatment}.${screen.why}`)]
		}
		switch (shape.how) {
			case 'kept':
				return [t('shape.kept')]
			case 'matches':
				return [t('shape.matches', { shape: name })]
			case 'designed':
				return [t(card === 'hidden' ? 'shape.designedHidden' : 'shape.designed')]
			case 'face':
				return [
					t('shape.face', { shape: name }),
					t(shape.asked ? 'shape.why.asked' : 'shape.why.face')
				]
			case 'centred':
				return [t('shape.centred', { shape: name }), t('shape.why.asked')]
			case 'whole':
				return [
					t(shape.fit === 'blur' ? 'shape.blur' : 'shape.bars', { shape: name }),
					t(shape.asked ? 'shape.why.asked' : 'shape.why.whole')
				]
		}
	}
	// The parts of a brief the plan used: those the user's words gave, and those it chose.
	const { brief: parts, questions } = summary
	// Asked on the quick questions: the user's when picked, chosen for them when not.
	const asked: { text: string; said: boolean }[] = [
		...(questions?.kind
			? [{ text: t('brief.kind', { kind: questions.kind.value }), said: questions.kind.said }]
			: []),
		...(questions?.shape
			? [{ text: t('brief.shape', { shape: questions.shape.value }), said: questions.shape.said }]
			: [])
	]
	const briefParts: { part: BriefPart; text: string }[] = [
		...(parts.audience
			? [{ part: 'audience' as const, text: t('brief.audience', { text: parts.audience }) }]
			: []),
		...(parts.tone ? [{ part: 'tone' as const, text: t('brief.tone', { text: parts.tone }) }] : []),
		...(parts.show ? [{ part: 'show' as const, text: t('brief.show', { text: parts.show }) }] : []),
		...(parts.callToAction
			? [
					{
						part: 'callToAction' as const,
						text: t('brief.callToAction', { text: parts.callToAction })
					}
				]
			: [])
	]
	// The brief's own parts first, then what the quick questions asked.
	const briefSaid = [
		...briefParts.filter(({ part }) => parts.said[part]).map(({ text }) => text),
		...asked.filter(({ said }) => said).map(({ text }) => text)
	]
	const briefChosen = [
		...briefParts.filter(({ part }) => !parts.said[part]).map(({ text }) => text),
		...asked.filter(({ said }) => !said).map(({ text }) => text)
	]
	// Each line of the plan, under the row of the plan card it belongs to; the
	// lines themselves are the same words as ever.
	const entries: { row: PlanRow | 'note'; text: string }[] = [
		{
			row: 'length',
			text: shortened
				? t('shortened', {
						from: formatTimecode(summary.originalSeconds),
						to: formatTimecode(seconds)
					})
				: t('whole', { length: formatTimecode(seconds) })
		},
		...(summary.keptSentences < summary.totalSentences
			? [
					{
						row: 'length' as const,
						text: t('keptSentences', {
							kept: summary.keptSentences,
							total: summary.totalSentences
						})
					}
				]
			: []),
		...(summary.fillerCuts > 0
			? [{ row: 'length' as const, text: t('fillers', { count: summary.fillerCuts }) }]
			: []),
		// A length asked (typed, clicked or in a follow-up) or chosen: said so, and
		// whether a reel's under-a-minute rule caps it. Otherwise the reel rule, if any.
		...(summary.maxSeconds !== null
			? [
					{
						row: 'length' as const,
						text: t(parts.said.lengthSeconds ? 'lengthAsked' : 'lengthChosen', {
							seconds: Math.round(summary.maxSeconds)
						})
					},
					...(summary.limitSeconds !== null && summary.limitSeconds < summary.maxSeconds
						? [
								{
									row: 'length' as const,
									text: t('lengthCapped', { seconds: summary.limitSeconds })
								}
							]
						: []),
					...(summary.trimmedToFit
						? [
								{
									row: 'length' as const,
									text: t('fitCutTo', {
										seconds: summary.limitSeconds ?? Math.round(summary.maxSeconds)
									})
								}
							]
						: [])
				]
			: summary.limitSeconds === null
				? []
				: [{ row: 'length' as const, text: t(summary.trimmedToFit ? 'fitCut' : 'fitOk') }]),
		...(summary.lengthened ? [{ row: 'length' as const, text: t('lengthened') }] : []),
		...(summary.opensWith
			? [
					{
						row: 'note' as const,
						text: t('opensWith', { line: firstWords(summary.opensWith, OPENER_WORDS) })
					}
				]
			: []),
		{ row: 'captions', text: t(`captions.${summary.captions}`) },
		...(summary.keyLines > 0
			? [{ row: 'screen' as const, text: t('keyLines', { count: summary.keyLines }) }]
			: []),
		...(summary.zooms > 0
			? [{ row: 'motion' as const, text: t('zooms', { count: summary.zooms }) }]
			: []),
		...(summary.transitions > 0
			? [
					{
						row: 'motion' as const,
						text: t(`transitions.${summary.transition}`, { count: summary.transitions })
					}
				]
			: []),
		{
			row: 'music',
			text: summary.music
				? t('music', { name: summary.music })
				: summary.musicMissing
					? t('noMusicFolder')
					: t('noMusic')
		},
		...shapeLines(summary).map((text) => ({ row: 'shape' as const, text })),
		...(summary.title
			? [{ row: 'screen' as const, text: t('title', { text: summary.title }) }]
			: []),
		...(summary.titleDropped ? [{ row: 'screen' as const, text: t('titleDropped') }] : []),
		...(summary.pictureMatters ? [] : [{ row: 'note' as const, text: t('speechOnly') }]),
		...(briefSaid.length > 0
			? [{ row: 'note' as const, text: t('brief.used', { parts: briefSaid.join(' · ') }) }]
			: []),
		...(briefChosen.length > 0
			? [
					{
						row: 'note' as const,
						text: t('brief.chosen', { for: parts.chosenFor, parts: briefChosen.join(' · ') })
					}
				]
			: [])
	]
	const shortNote = summary.short ? t(`short.${summary.short}`, { length }) : null
	// The lines shown again over the chat in the editor: the plan's, and the warning if any.
	const lines = [...entries.map(({ text }) => text), ...(shortNote ? [shortNote] : [])]
	const rows = PLAN_ROWS.flatMap(({ key, icon: Icon }) => {
		const texts = entries.filter((entry) => entry.row === key).map(({ text }) => text)
		return texts.length > 0 ? [{ key, Icon, texts }] : []
	})
	const notes = entries.filter((entry) => entry.row === 'note').map(({ text }) => text)
	return (
		<section
			role="status"
			aria-label={t('label')}
			className="border-border bg-surface flex w-full flex-col gap-4 rounded-[20px] border p-6"
		>
			<div className="flex items-center justify-between gap-3">
				<span className="text-accent-fg flex items-center gap-1.5 text-xs font-extrabold tracking-[0.14em] uppercase">
					<SparkleIcon size={13} />
					{t('label')}
				</span>
				<span className="bg-surface-hover text-text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">
					{t('notApplied')}
				</span>
			</div>
			<div className="flex flex-col gap-1.5">
				<h2 className="text-text text-[25px] leading-tight font-extrabold tracking-[-0.02em]">
					{t(`making.${summary.making}`, { length })}
				</h2>
				{summary.summary && <p className="text-text-muted text-[13px]">{summary.summary}</p>}
			</div>
			{shortNote && (
				<p
					role="note"
					className="bg-warning/10 text-text flex items-start gap-2 rounded-xl p-3 text-sm"
				>
					<span className="text-warning mt-0.5 shrink-0">
						<AlertIcon size={15} />
					</span>
					{shortNote}
				</p>
			)}
			{notes.length > 0 && (
				<ul className="text-text-muted -mt-2 flex flex-col gap-0.5 text-[13px]">
					{notes.map((note) => (
						<li key={note}>{note}</li>
					))}
				</ul>
			)}
			<ul className="grid gap-2.5 sm:grid-cols-2">
				{rows.map(({ key, Icon, texts }) => (
					<li
						key={key}
						className="border-border bg-surface-inset flex items-start gap-3 rounded-xl border p-3"
					>
						<span className="bg-accent-soft text-accent-fg flex size-8 shrink-0 items-center justify-center rounded-lg">
							<Icon size={15} />
						</span>
						<span className="flex min-w-0 flex-col gap-0.5">
							<span className="text-text-faint text-[11px] font-bold">{t(`rows.${key}`)}</span>
							{texts.map((text, index) => (
								<span
									key={text}
									className={cn(
										'text-[13px] leading-snug',
										index === 0 ? 'text-text font-extrabold' : 'text-text-muted'
									)}
								>
									{text}
								</span>
							))}
						</span>
					</li>
				))}
			</ul>
			<div
				className={cn(
					'flex flex-col gap-1 rounded-xl p-3',
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
			<div className="flex flex-wrap items-center gap-2">
				<Button type="button" className="rounded-[10px]" onClick={() => onApply(lines)}>
					{t('apply')}
					<ArrowRightIcon size={14} />
				</Button>
				<Button
					type="button"
					variant="outline"
					className="rounded-[10px]"
					onClick={() => onManual(lines)}
				>
					<ManualIcon size={15} />
					{t('manual')}
				</Button>
				<Button type="button" variant="outline" className="rounded-[10px]" onClick={onCancel}>
					{t('change')}
				</Button>
				<Button type="button" variant="ghost" className="ml-auto rounded-[10px]" onClick={onCancel}>
					{t('cancel')}
				</Button>
			</div>
		</section>
	)
}

/**
 * Beside the plan: the picked video, upright, as the plan will frame it,
 * and a line saying nothing has changed yet.
 */
function Preview({ video }: { video: Video | null }) {
	const t = useTranslations('Make.chat')
	const plan = useTranslations('Make.plan')
	return (
		<div className="flex shrink-0 flex-col items-center gap-2">
			<div className="bg-night relative h-[440px] w-[248px] overflow-hidden rounded-[18px] border border-white/20">
				{video && (
					<video
						src={video.url}
						controls
						playsInline
						aria-label={t('videoLabel', { name: video.file.name })}
						className="size-full object-cover"
					/>
				)}
				<span className="text-ink pointer-events-none absolute top-3 left-3 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider uppercase">
					{plan('preview')}
				</span>
			</div>
			<span className="text-text-faint text-[11px]">{plan('previewNote')}</span>
		</div>
	)
}

const BYTES_PER_MB = 1024 * 1024

/**
 * The picked video as an attachment: a still from it with its length, its
 * name, its picture size and file size, and Replace. Read from the file in
 * the browser, only to show it.
 */
function AttachedVideo({ file, onReplace }: { file: File; onReplace: () => void }) {
	const t = useTranslations('Make')
	const [meta, setMeta] = useState<{ seconds: number; height: number } | null>(null)
	const size = `${(file.size / BYTES_PER_MB).toFixed(file.size < 10 * BYTES_PER_MB ? 1 : 0)} MB`
	return (
		<div className="bg-surface-hover flex flex-wrap items-center gap-4 rounded-[18px] p-3.5">
			<span className="bg-night relative h-14 w-24 shrink-0 overflow-hidden rounded-xl">
				<video
					// The file's own URL, for as long as this shows it.
					ref={(element) => {
						if (!element) return
						const url = URL.createObjectURL(file)
						element.src = `${url}#t=0.5`
						return () => URL.revokeObjectURL(url)
					}}
					muted
					playsInline
					preload="metadata"
					aria-hidden
					onLoadedMetadata={(event) => {
						const { duration, videoHeight } = event.currentTarget
						setMeta({ seconds: Number.isFinite(duration) ? duration : 0, height: videoHeight })
					}}
					className="size-full object-cover"
				/>
				{meta && meta.seconds > 0 && (
					<span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">
						{formatTimecode(meta.seconds)}
					</span>
				)}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="text-text truncate text-[15px] font-extrabold">{file.name}</span>
				<span className="text-text-muted text-[13px]">
					{meta && meta.height > 0 ? t('ready', { quality: `${meta.height}p`, size }) : size}
				</span>
			</span>
			<Button type="button" variant="outline" aria-label={t('changeVideo')} onClick={onReplace}>
				{t('replace')}
			</Button>
		</div>
	)
}
