'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SpinnerIcon } from '@/components/ui/icons'
import { handOffStart } from '@/app/[locale]/editor/projects/editor-start'
import { setSideOpen } from '@/app/[locale]/editor/components/shell/editor-layout-store'
import { probeVideo } from '@/app/[locale]/editor/model/sources'
import { useTakeAnalysis } from '@/app/[locale]/editor/audio/use-take-analysis'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { clearMakeStart, peekMakeStart } from './make-start'
import {
	MAX_ANSWER_LENGTH,
	MAX_MAKE_SECONDS,
	MAX_REQUEST_LENGTH,
	type MakeAnswer
} from './make-plan'
import { questionsToAsk, type MakeChoices, type QuestionId } from './make-questions'
import { QuickQuestions } from './quick-questions'
import { MakeRequestForm } from './make-request-form'
import { useMakePlan } from './use-make-plan'
import { PlanView } from './plan-view'
import { type Ask, type Video } from './make-plan-request'

/**
 * Make it: pick a video, say what it should become, and Retake plans the
 * whole edit (asking first when the request is unclear). The plan is shown
 * with Apply and Cancel; Apply opens it in the editor as one undoable step.
 */
export function MakeIt({ heading }: { heading: React.ReactNode }) {
	const t = useTranslations('Make')
	const router = useRouter()
	// A video and request handed over from the home page's Make it card, if any.
	const [file, setFile] = useState<File | null>(() => peekMakeStart()?.file ?? null)
	const [request, setRequest] = useState(() => peekMakeStart()?.request ?? '')
	const [video, setVideo] = useState<Video | null>(null)
	const [ask, setAsk] = useState<Ask | null>(null)
	// The quick questions on screen for the request, if any: planning waits for them.
	const [asking, setAsking] = useState<{ request: string; shown: QuestionId[] } | null>(null)
	const [problem, setProblem] = useState<'notVideo' | 'tooLong' | null>(null)
	const [reading, setReading] = useState(false)
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

	const { frames, transcriptReady, transcript, fillerCuts, plan, failed } = useMakePlan({
		video,
		ask,
		analysis,
		t
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
		<MakeRequestForm
			file={file}
			request={request}
			setRequest={setRequest}
			overLimit={overLimit}
			problem={problem}
			pick={pick}
			start={start}
		/>
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
