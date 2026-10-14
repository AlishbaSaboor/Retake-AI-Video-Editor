'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
	AlertIcon,
	AttachIcon,
	CaptionsIcon,
	CropIcon,
	MusicIcon,
	TextIcon,
	TimingIcon,
	VideoIcon,
	CheckIcon,
	LockIcon,
	SpinnerIcon,
	UploadIcon
} from '@/components/ui/icons'
import { handOffStart } from '@/app/[locale]/editor/projects/editor-start'
import { setSideOpen } from '@/app/[locale]/editor/components/shell/editor-layout-store'
import { probeVideo } from '@/app/[locale]/editor/model/sources'
import { formatTimecode } from '@/app/[locale]/editor/model/timeline-scale'
import { useTakeAnalysis } from '@/app/[locale]/editor/audio/use-take-analysis'
import { VoiceCommandButton } from '@/app/[locale]/editor/components/assistant/voice-command-button'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { clearMakeStart, peekMakeStart } from './make-start'
import { captureFrames } from './frames'
import {
	frameTimes,
	MAX_ANSWER_LENGTH,
	MAX_MAKE_SECONDS,
	MAX_REQUEST_LENGTH,
	type BriefPart,
	type MakeAnswer,
	type MakeSummary
} from './make-plan'
import { questionsToAsk, type MakeChoices, type QuestionId } from './make-questions'
import { QuickQuestions } from './quick-questions'
import { buildPlan, type Ask, type Video } from './make-plan-request'

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
			return buildPlan({
				video,
				ask,
				frames: frames.data,
				transcript,
				fillerCuts,
				unclear: t('errors.planning')
			})
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
							musicAvailable: plan.data.musicAvailable,
							videoColour: plan.data.videoColour
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

	/** The page around each stage: where it is in the four steps, the heading, then the stage. */
	const frame = (stage: Stage, content: React.ReactNode) =>
		stage === 4 ? (
			// The plan, as the design has it: the video upright on the left, the plan beside it.
			<div className="flex flex-col gap-7">
				<Progress stage={stage} />
				<div className="sr-only">{heading}</div>
				<div className="grid items-start gap-[clamp(20px,3vw,40px)] md:grid-cols-[auto_minmax(0,1fr)]">
					<Preview video={video} />
					<div className="min-w-0">{content}</div>
				</div>
			</div>
		) : (
			<div className="flex flex-col gap-7">
				<Progress stage={stage} />
				{heading}
				<div className="w-full">{content}</div>
			</div>
		)

	if (ask && failed) {
		return frame(
			3,
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
			2,
			<Questions
				questions={plan.data.questions}
				onAnswer={(answers) => setAsk({ ...ask, answers })}
				onCancel={() => setAsk(null)}
			/>
		)
	}
	if (ask && plan.data?.kind === 'plan') {
		return frame(
			4,
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
			3,
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
			2,
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
			3,
			<Card>
				<p role="status" className="text-text flex items-center gap-3 text-[17px] font-semibold">
					<SpinnerIcon size={18} className="text-accent-fg" />
					{step}
				</p>
				<span aria-hidden className="flex h-[84px] items-center gap-[3px]">
					{READING_BARS.map((height, i) => (
						<i
							key={i}
							className="rt-pulse flex-1 rounded-[2px] bg-linear-to-b from-(--blue) to-(--accent)"
							style={{ height: `${height}%`, animationDelay: `${(i % 12) * 0.08}s` }}
						/>
					))}
				</span>
				<p className="text-text-faint text-[13px]">{t('steps.note')}</p>
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
			<div className="w-full">
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
						'flex flex-col gap-4 rounded-[18px] transition-shadow',
						dragging && 'ring-accent-glow ring-4'
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
							className="border-border-strong text-text-muted hover:border-accent hover:bg-accent-soft focus-visible:outline-accent flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed px-6 py-[18px] text-center transition-colors focus-visible:outline-2"
						>
							<span className="text-accent-fg">
								<UploadIcon size={26} />
							</span>
							<span className="text-text text-[15px] font-semibold">{t('chooseVideo')}</span>
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
					<div className="border-border-strong bg-surface-inset focus-within:border-accent flex flex-col gap-1 rounded-[14px] border px-3.5 py-3">
						<label
							htmlFor="make-request"
							className="text-text-faint font-mono text-[11.5px] tracking-[0.08em] uppercase"
						>
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
							className="text-text placeholder:text-text-faint font-display w-full resize-none bg-transparent text-xl tracking-[-0.015em] focus-visible:outline-none"
						/>
						<p
							id="make-request-count"
							role={overLimit ? 'alert' : undefined}
							className={cn('text-xs', overLimit ? 'text-danger font-semibold' : 'text-text-faint')}
						>
							{overLimit
								? t('requestOver', {
										count: request.length - MAX_REQUEST_LENGTH,
										max: MAX_REQUEST_LENGTH
									})
								: t('requestLeft', { count: MAX_REQUEST_LENGTH - request.length })}
						</p>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{EXAMPLES.map(({ key }) => (
							<button
								key={key}
								type="button"
								onClick={() => setRequest(t(`examples.${key}`))}
								className={cn(
									'focus-visible:outline-accent inline-flex items-center rounded-full border px-3 py-1.5 text-[13.5px] transition-colors focus-visible:outline-2',
									request === t(`examples.${key}`)
										? 'border-accent bg-accent-soft text-text font-semibold'
										: 'border-border-strong text-text-muted hover:border-accent hover:text-text'
								)}
							>
								{t(`examples.${key}`)}
							</button>
						))}
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							aria-label={t('attach')}
							title={t('attach')}
							onClick={() => inputRef.current?.click()}
							className="border-border-strong text-text-muted hover:text-text hover:bg-border focus-visible:outline-accent flex size-11 items-center justify-center rounded border transition-colors focus-visible:outline-2"
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
							className="ml-auto"
							disabled={!file || !request.trim() || overLimit}
						>
							{t('makeIt')}
						</Button>
					</div>
				</section>
			</div>
			{problem && (
				<p role="alert" className="text-danger text-center text-sm">
					{t(`errors.${problem}`, { minutes: MAX_MAKE_SECONDS / 60 })}
				</p>
			)}
			<p className="text-text-faint flex items-start gap-2 text-[13px]">
				<LockIcon size={14} className="mt-0.5 shrink-0" />
				{t('steps.note')}
			</p>
		</form>
	)
}

type Stage = 1 | 2 | 3 | 4
const STAGES = ['describe', 'questions', 'transcript', 'plan'] as const

/** The bars of the waveform shown while the video is read, in percent. */
const READING_BARS = Array.from({ length: 72 }, (_, i) =>
	Math.round(20 + 70 * Math.abs(Math.sin(i * 0.47) * Math.cos(i * 0.19)))
)

/**
 * Where Make it is, as the design shows it: "Step 2 of 4", how many are left,
 * and a bar for each step, those done and the one now filled. 1 the video and
 * request, 2 the questions (when any are asked), 3 the transcript and the
 * plan being made, 4 the plan to review.
 */
function Progress({ stage }: { stage: Stage }) {
	const t = useTranslations('Make.progress')
	return (
		<div className="flex flex-col gap-2.5" aria-live="polite">
			<div className="flex items-baseline justify-between gap-3">
				<span className="font-display text-text text-[15px] font-semibold">
					{t('step', { step: stage, total: STAGES.length })}
				</span>
				<span className="text-accent-fg font-mono text-[11.5px] tracking-[0.06em] uppercase">
					{t('left', { count: STAGES.length - stage })}
				</span>
			</div>
			<ol className="grid grid-cols-4 gap-1.5">
				{STAGES.map((key, index) => {
					const number = index + 1
					const done = number < stage
					const current = number === stage
					return (
						<li
							key={key}
							aria-current={current ? 'step' : undefined}
							className="flex min-w-0 flex-col gap-[7px]"
						>
							<i
								aria-hidden
								className={cn(
									'h-1 rounded-full transition-colors duration-300',
									current
										? 'bg-accent'
										: done
											? 'bg-[color-mix(in_srgb,var(--accent)_55%,transparent)]'
											: 'bg-border-strong'
								)}
							/>
							<span
								className={cn(
									'truncate text-[12.5px]',
									current
										? 'text-text font-semibold'
										: done
											? 'text-text-muted'
											: 'text-text-faint max-[560px]:sr-only',
									!current && 'max-[560px]:sr-only'
								)}
							>
								{t(`names.${key}`)}
							</span>
						</li>
					)
				})}
			</ol>
		</div>
	)
}

function Card({ children }: { children: React.ReactNode }) {
	return <section className="flex w-full flex-col gap-4">{children}</section>
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
				<h2 className="text-text text-[clamp(28px,3vw,40px)] leading-[1.02] tracking-[-0.03em]">
					{t('questions.title')}
				</h2>
				{questions.map((question, index) => (
					<label key={question} className="flex flex-col gap-1.5">
						<span className="text-text font-semibold">{question}</span>
						<input
							value={answers[index] ?? ''}
							onChange={(event) =>
								setAnswers((all) => all.map((a, i) => (i === index ? event.target.value : a)))
							}
							maxLength={MAX_ANSWER_LENGTH}
							className="border-border-strong bg-surface text-text focus-visible:border-accent h-[46px] rounded border px-3.5 text-[15px] focus-visible:outline-none"
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
	// The look: the user's when their words or a click chose it, chosen for them otherwise.
	const lookLine = summary.look.said
		? t('look.asked', { preset: summary.look.preset })
		: t('look.chosen', { preset: summary.look.preset, making: summary.making })
	const shortNote = summary.short ? t(`short.${summary.short}`, { length }) : null
	// The lines shown again over the chat in the editor: the plan's, and the warning if any.
	const lines = [...entries.map(({ text }) => text), ...(shortNote ? [shortNote] : [])]
	const rows = PLAN_ROWS.flatMap(({ key, icon: Icon }) => {
		const texts = entries.filter((entry) => entry.row === key).map(({ text }) => text)
		return texts.length > 0 ? [{ key, Icon, texts }] : []
	})
	const notes = [
		lookLine,
		...entries.filter((entry) => entry.row === 'note').map(({ text }) => text)
	]
	return (
		<section role="status" aria-label={t('label')} className="flex w-full flex-col gap-4">
			<div className="flex flex-col gap-2.5">
				<p className="text-accent-fg font-mono text-[11.5px] tracking-[0.08em] uppercase">
					{t('label')} · {t('notApplied')}
				</p>
				<h2 className="text-text text-[clamp(28px,3vw,40px)] leading-[1.02] tracking-[-0.03em]">
					{t(`making.${summary.making}`, { length })}
				</h2>
				{summary.summary && <p className="text-text-muted">{summary.summary}</p>}
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
				<ul className="text-text-muted flex flex-col gap-0.5 text-[13.5px]">
					{notes.map((note) => (
						<li key={note}>{note}</li>
					))}
				</ul>
			)}
			<ol className="border-border border-t">
				{rows.map(({ key, texts }) => (
					<li
						key={key}
						className="rt-fade-in border-border grid grid-cols-[7.5em_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 border-b py-[11px] max-[560px]:grid-cols-1"
					>
						<span className="text-text-faint text-[13.5px]">{t(`rows.${key}`)}</span>
						<span className="flex min-w-0 flex-col gap-0.5">
							{texts.map((text, index) => (
								<span
									key={text}
									className={
										index === 0 ? 'text-text font-semibold' : 'text-text-muted text-[13px]'
									}
								>
									{text}
								</span>
							))}
						</span>
					</li>
				))}
			</ol>
			<div className="flex flex-col gap-1">
				<p
					className={cn(
						'flex items-center gap-1.5 text-[13.5px] font-semibold',
						problems === null ? 'text-text-muted' : 'text-success'
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
				<div className="border-border flex flex-col gap-1 rounded-[14px] border p-4">
					<p className="text-text text-sm font-semibold">{t('cannotDo')}</p>
					<ul className="text-text-muted list-disc pl-5 text-sm">
						{summary.cannotDo.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</div>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<Button type="button" onClick={() => onApply(lines)}>
					{t('apply')}
				</Button>
				<Button type="button" variant="outline" onClick={() => onManual(lines)}>
					{t('manual')}
				</Button>
				<Button type="button" variant="outline" onClick={onCancel}>
					{t('change')}
				</Button>
				<Button type="button" variant="ghost" className="ml-auto" onClick={onCancel}>
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
		<div className="flex shrink-0 flex-col gap-2.5">
			<div className="bg-night relative aspect-9/16 w-[clamp(200px,24vw,280px)] overflow-hidden rounded-[18px] shadow-(--shadow-card)">
				{video && (
					<video
						src={video.url}
						controls
						playsInline
						aria-label={t('videoLabel', { name: video.file.name })}
						className="size-full object-cover"
					/>
				)}
				<span className="text-ink pointer-events-none absolute top-2.5 left-2.5 rounded-[7px] bg-white/92 px-2 py-[3px] font-mono text-[11px] font-bold uppercase">
					{plan('preview')}
				</span>
			</div>
			<span className="text-text-faint max-w-[260px] text-[13px]">{plan('previewNote')}</span>
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
		<div className="bg-surface-hover flex flex-wrap items-center gap-3 rounded p-2">
			<span className="bg-night relative aspect-video w-[76px] shrink-0 overflow-hidden rounded-lg">
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
				<span className="text-text truncate font-semibold">{file.name}</span>
				<span className="text-text-faint text-[13px]">
					{meta && meta.height > 0 ? t('ready', { quality: `${meta.height}p`, size }) : size}
				</span>
			</span>
			<Button
				type="button"
				variant="outline"
				size="sm"
				aria-label={t('changeVideo')}
				onClick={onReplace}
			>
				{t('replace')}
			</Button>
		</div>
	)
}
