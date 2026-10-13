import { getTranslations } from 'next-intl/server'
import { ArrowRightIcon, CheckIcon } from '@/components/ui/icons'
import { DisplayHeading, Eyebrow, Lead } from '@/components/site/display'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import s from './landing.module.css'

// The landing page, scene by scene, as the design lays it out. Everything
// here renders on the server; landing-motion.tsx moves it as the page
// scrolls. The footage is Retake's own sample trip (public/site/clip), shown
// in the design's violet duotone.

const PICTURE = '/site/clip/hero-picture.webp'
const THUMBS = ['/site/clip/thumb-1.webp', '/site/clip/thumb-2.webp', '/site/clip/thumb-3.webp']
const CLIP = '/site/clip/before.webm'
const CLIP_POSTER = '/site/clip/before-poster.webp'

const STEP_KEYS = ['bring', 'tidy', 'again', 'yours', 'share'] as const
const PLAN_ROWS = [
	'length',
	'shape',
	'look',
	'tone',
	'captions',
	'onScreen',
	'motion',
	'music'
] as const
const TOOL_KEYS = [
	'transcript',
	'cleanup',
	'captions',
	'text',
	'annotate',
	'frame',
	'colour',
	'speed',
	'highlights',
	'export'
] as const
const FAQ_KEYS = [
	'what',
	'free',
	'asking',
	'undo',
	'install',
	'videos',
	'vertical',
	'rerecord',
	'kept'
] as const
const PROMISE_KEYS = ['apply', 'undo', 'browser'] as const
const RULER = ['0:00', '0:15', '0:30', '0:45', '1:00'] as const
const SPEEDS = ['0.5×', '1×', '1.5×', '2×'] as const

/** A waveform's bar heights, in percent: the same every render, so server and browser agree. */
function bars(count: number, phase = 0.55, seed = count): number[] {
	return Array.from({ length: count }, (_, i) => {
		const wave = Math.abs(Math.sin(i * phase + seed) * Math.cos(i * 0.21))
		const grain = (Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1
		return Math.min(100, Math.round(18 + 70 * wave + 12 * Math.abs(grain)))
	})
}

/** A picture of the sample trip, in the duotone. */
function Footage({
	className,
	src = PICTURE,
	position,
	style,
	children
}: {
	className?: string
	src?: string
	position?: string
	style?: React.CSSProperties
	children?: React.ReactNode
}) {
	return (
		<span className={cn(s.duo, 'block', className)} style={style}>
			{/* Decorative: the scene around it says what it shows. */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={src} alt="" loading="lazy" decoding="async" style={{ objectPosition: position }} />
			{children}
		</span>
	)
}

export async function WordRiver() {
	const t = await getTranslations('Site.landingPage')
	return (
		<div className={s.river} aria-hidden data-river>
			{[0, 1, 2, 3, 4, 5].map((row) => (
				<div key={row} className={s.row} style={{ top: `${6 + row * 16}%` }} data-row={row}>
					{[0, 1, 2, 3].map((copy) => (
						<span key={copy}>{t.rich(`river.${row}`, { cut: (chunks) => <i>{chunks}</i> })}</span>
					))}
				</div>
			))}
		</div>
	)
}

export function Timecode() {
	return (
		<div className={s.tcode} aria-hidden>
			<span className={s.rec} />
			<b data-timecode>00:00:00</b>
			<span>/ 02:48:00</span>
		</div>
	)
}

export async function Hero() {
	const t = await getTranslations('Site.landingPage')
	const after = t('say.after').split(' ')
	return (
		<section className={cn(s.wrap, s.hero)} aria-labelledby="hero-title" data-hero>
			<Eyebrow>{t('eyebrow')}</Eyebrow>
			<DisplayHeading as="h1" size="hero" className="mt-[22px] max-w-[11ch]" id="hero-title">
				{t('title')}
			</DisplayHeading>
			<div className={s.say} role="img" aria-label={t('say.label')}>
				<span className={cn(s.mono, s.sayTc)} data-say-tc>
					0:18
				</span>
				<p className={s.sayLine} aria-hidden>
					<span data-word>{t('say.before')}</span>{' '}
					<span className={s.fl} data-filler>
						<span>{t('say.filler')}</span>
					</span>{' '}
					{after.map((word, i) => (
						<span key={i}>
							<span data-word>{word}</span>
							{i < after.length - 1 && ' '}
						</span>
					))}
				</p>
				<span
					className={cn(s.mono, s.sayNote)}
					aria-hidden
					data-say-note
					data-scroll={t('say.scroll')}
					data-marked={t('say.marked')}
					data-cut={t('say.cut')}
					data-playing={t('say.playing')}
				>
					{t('say.scroll')}
				</span>
			</div>
			<Lead className="mt-[clamp(26px,3vw,40px)]">{t('lead')}</Lead>
			<div className={s.heroCta}>
				<Link
					href="/home"
					className="rt-btn bg-accent text-accent-ink focus-visible:outline-accent inline-flex min-h-[52px] items-center gap-2.5 rounded-full px-6 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
				>
					{t('start')}
					<ArrowRightIcon size={18} />
				</Link>
				<a href="#how-it-works" className={s.link}>
					{t('watch')}
				</a>
			</div>
		</section>
	)
}

export async function StoryScene() {
	const t = await getTranslations('Site.landingPage.story')
	const cut = (chunks: React.ReactNode) => <span className={s.f}>{chunks}</span>
	const caption = t('caption').split(' ')
	return (
		<>
			<div id="how-it-works" className={cn(s.wrap, s.sceneHead)}>
				<Eyebrow>{t('eyebrow')}</Eyebrow>
				<DisplayHeading size="page" className="rt-reveal mt-[22px] max-w-[14ch]">
					{t('title')}
				</DisplayHeading>
				<Lead className="mt-5">{t('lead')}</Lead>
			</div>
			<section id="story" className={s.story} aria-label={t('label')} data-scene="story">
				<div className={s.pin}>
					<div className={cn(s.wrap, s.storyGrid)}>
						<ol className={s.steps} data-steps>
							<span className={s.fill} aria-hidden />
							{STEP_KEYS.map((key) => (
								<li key={key} data-step>
									<span className={s.lab}>{t(`steps.${key}.label`)}</span>
									<div className={s.body}>
										<div>
											<h3>{t(`steps.${key}.title`)}</h3>
											<p>{t(`steps.${key}.body`)}</p>
										</div>
									</div>
								</li>
							))}
						</ol>
						<div className={s.stage} role="img" aria-label={t('stageLabel')} data-stage>
							<Footage className={s.stFrame}>
								<span className={s.fname}>{t('file')}</span>
								<span className={s.stTitle}>{t.rich('titleCard', { br: () => <br /> })}</span>
								<span className={s.stCap}>
									{caption.map((word, i) => (
										<span key={i} style={{ '--i': i } as React.CSSProperties}>
											{word}
										</span>
									))}
								</span>
							</Footage>
							<div className={s.stTrans} aria-hidden>
								{[0, 1, 2, 3, 4].map((i) => (
									<div
										key={i}
										className={cn(s.tl, i === 3 && s.redo)}
										style={{ '--i': i } as React.CSSProperties}
									>
										<span className={s.t}>{['0:01', '0:03', '0:08', '0:18', '0:24'][i]}</span>
										<span>{t.rich(`lines.${i}`, { cut })}</span>
									</div>
								))}
							</div>
							<div className={s.stMic} aria-hidden>
								<i />
								<i />
								<i />
								<i />
								{t('recording')}
							</div>
							<div className={s.stSaid} aria-hidden>
								{t('said')}
							</div>
							<div className={s.stTl} aria-hidden>
								<div className={s.stRuler}>
									{RULER.map((mark) => (
										<span key={mark}>{mark}</span>
									))}
								</div>
								<div className={s.stTrack}>
									<Footage className={cn(s.seg, s.k1)} />
									<span className={cn(s.seg, s.pause)} />
									<Footage className={cn(s.seg, s.k2)} position="30% 50%" />
									<Footage className={cn(s.seg, s.k3, 'relative')} src={THUMBS[1]}>
										<span className={s.newTake} />
									</Footage>
									<span className={cn(s.seg, s.pause)} />
									<Footage className={cn(s.seg, s.k4)} src={THUMBS[2]} />
									<span className={s.stHead} />
								</div>
								<div className={s.stWave}>
									{bars(90).map((height, i) => (
										<i key={i} style={{ height: `${height}%` }} />
									))}
								</div>
							</div>
							<div className={s.stClips} aria-hidden>
								{[
									{ x0: '22%', dx: '-40%', r: '-8deg', src: PICTURE },
									{ x0: '44%', dx: '0%', r: '0deg', src: THUMBS[0] },
									{ x0: '66%', dx: '40%', r: '8deg', src: THUMBS[1] }
								].map(({ x0, dx, r, src }, i) => (
									<Footage
										key={i}
										className={s.stClip}
										src={src}
										// Where each clip starts, and how far and how much it turns as it fans out.
										style={{ '--x0': x0, '--dx': dx, '--r': r } as React.CSSProperties}
									>
										<span>{t(`clips.${i}`)}</span>
									</Footage>
								))}
							</div>
						</div>
					</div>
				</div>
			</section>
		</>
	)
}

export async function MakeScene() {
	const t = await getTranslations('Site.landingPage.make')
	const story = await getTranslations('Site.landingPage.story')
	const reelWords = story('caption').split(' ').slice(2)
	const who = (kind: string) =>
		kind === 'asked' ? t('asked') : kind === 'chosen' ? t('chosen') : ''
	return (
		<section id="make" className={s.make} aria-label={t('label')} data-scene="make">
			<div className={s.pin}>
				<div className={cn(s.wrap, s.makeGrid)}>
					<div>
						<Eyebrow>{t('eyebrow')}</Eyebrow>
						<DisplayHeading
							className={cn('mt-[22px] text-[clamp(36px,4.6vw,68px)] leading-[0.98]', s.makeTitle)}
						>
							{t('title')}
						</DisplayHeading>
						<Lead className={cn('mt-[18px]', s.makeLead)}>{t('lead')}</Lead>
						<ol className={s.makeSteps} aria-hidden>
							{[0, 1, 2, 3, 4].map((i) => (
								<li key={i} data-make-step>
									{t(`steps.${i}`)}
								</li>
							))}
						</ol>
					</div>
					<div className={s.app} aria-hidden>
						<div className={s.appBar}>
							<span className={s.recdot} />
							<b>{t('bar')}</b>
							<span className="ml-auto">{t('path')}</span>
						</div>

						<div className={cn(s.pane, s.paneType)} data-pane="type" data-show>
							<div className={s.file}>
								<Footage className={s.thumb} />
								<span>
									<b>weekend-trip.mp4</b>
									<small>{t('fileMeta')}</small>
								</span>
							</div>
							<div className={s.ask}>
								<span>{t('ask')}</span>
								<div className={s.typed}>
									<span data-typed data-text={t('request')} />
									<span className={s.caret} />
								</div>
								<div className={cn(s.askRow, s.mono)}>
									{t('inputs')}
									<span className={s.go}>{t('go')}</span>
								</div>
							</div>
							<p className={s.note}>{t('startFrom')}</p>
						</div>

						<div className={s.pane} data-pane="ask">
							<h4>{t('questionsTitle')}</h4>
							<p className={s.sub}>{t('questionsSub')}</p>
							<div className={s.q}>
								<span>{t('lengthQuestion')}</span>
								<div className={s.opts}>
									{[0, 1, 2, 3].map((i) => (
										<i key={i} data-len={i}>
											{t(`lengths.${i}`)}
										</i>
									))}
								</div>
							</div>
							<div className={s.q}>
								<span>{t('lookQuestion')}</span>
								<div className={s.opts}>
									{[0, 1, 2, 3, 4].map((i) => (
										<i key={i} data-look={i}>
											{t(`looks.${i}`)}
										</i>
									))}
								</div>
							</div>
							<div className={s.q}>
								<span>{t('tone')}</span>
								<div
									className={s.field}
									data-tone
									data-value={t('toneValue')}
									data-placeholder={t('tonePlaceholder')}
								>
									{t('tonePlaceholder')}
								</div>
							</div>
							<div className={s.q}>
								<span>{t('cta')}</span>
								<div className={s.field}>{t('ctaValue')}</div>
							</div>
							<div className={s.act}>
								<span className={s.go}>{t('makePlan')}</span>
								<span className={s.ghost}>{t('skipAll')}</span>
							</div>
						</div>

						<div className={cn(s.pane, s.paneRead)} data-pane="read">
							<h4>{t('readingTitle')}</h4>
							<p className={s.sub}>{t('readingSub')}</p>
							<div className={s.readwave}>
								{bars(64, 0.47, 3).map((height, i) => (
									<i key={i} style={{ height: `${height}%` }} data-read-bar />
								))}
							</div>
							<div className={s.readlines}>
								{[0, 1, 2, 3].map((i) => (
									<div key={i} data-read-line>
										<span className={s.t}>{['0:01', '0:03', '0:13', '0:18'][i]}</span>
										{t(`readingLines.${i}`)}
									</div>
								))}
							</div>
							<p className={s.note}>{t('privacy')}</p>
						</div>

						<div className={s.pane} data-pane="plan">
							<div className={s.planHead}>
								<div>
									<span className={s.mono} style={{ color: 'var(--accent-fg)' }}>
										{t('planLabel').toUpperCase()}
									</span>
									<h4 className="mt-1.5">{t('planTitle')}</h4>
								</div>
								<span className={s.pill}>{t('planPill')}</span>
							</div>
							<p className={s.planSum}>{t('planSummary')}</p>
							<ol className={s.planList}>
								{PLAN_ROWS.map((row) => (
									<li key={row} data-plan-row>
										<span className={s.k}>{t(`rows.${row}.k`)}</span>
										<span>{t(`rows.${row}.v`)}</span>
										<span className={s.who} data-who={t(`rows.${row}.who`)}>
											{who(t(`rows.${row}.who`))}
										</span>
									</li>
								))}
							</ol>
							<p className={s.checked} data-checked>
								{t.rich('checked', { ok: (chunks) => <b>{chunks}</b> })}
							</p>
							<div className={s.act}>
								<span className={s.go} data-apply>
									{t('apply')}
								</span>
								<span className={s.ghost}>{t('manual')}</span>
								<span className={s.ghost}>{t('change')}</span>
							</div>
						</div>

						<div className={cn(s.pane, s.paneDone)} data-pane="done">
							<div className={s.doneWrap}>
								<span className={cn(s.duo, s.reel)}>
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img src={CLIP_POSTER} alt="" loading="lazy" decoding="async" />
									<video
										src={CLIP}
										muted
										loop
										playsInline
										preload="none"
										poster={CLIP_POSTER}
										data-reel-video
									/>
									<span className={s.rt}>{story.rich('titleCard', { br: () => <br /> })}</span>
									<span className={s.rc}>
										<span data-reel-word data-words={reelWords.join(' ')}>
											{reelWords[0]}
										</span>
									</span>
								</span>
								<div className={s.doneCopy}>
									<span className={s.applied}>
										<CheckIcon size={16} />
										{t('applied')}
									</span>
									<span className={s.big}>{t('length')}</span>
									<p className="text-text-muted">{t('from')}</p>
									<div className="flex flex-wrap gap-2">
										<span className={s.chip}>{t('undo')}</span>
										<span className={s.chip}>{t('manual')}</span>
										<span className={s.chip}>{t('export')}</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}

/** Each tool card's little looping picture. */
function Illustration({
	tool,
	t
}: {
	tool: (typeof TOOL_KEYS)[number]
	t: (key: string) => string
}) {
	switch (tool) {
		case 'transcript':
			return (
				<span className={s.ill}>
					<span className={s.ln} style={{ top: 22 }} />
					<span className={s.ln} style={{ top: 44 }} data-on />
					<span className={s.ln} style={{ top: 66, right: '40%' }} />
					<span className={s.ln} style={{ top: 88, right: '28%' }} />
					<span className={s.illMic}>
						<i />
						<i style={{ animationDelay: '.2s' }} />
						<i style={{ animationDelay: '.4s' }} />
					</span>
				</span>
			)
		case 'cleanup':
			return (
				<span className={s.ill}>
					<span className={s.wv}>
						{bars(40).map((height, i) => (
							<i
								key={i}
								style={{ height: `${height}%` }}
								data-cut={i >= 16 && i <= 23 ? '' : undefined}
							/>
						))}
					</span>
				</span>
			)
		case 'captions':
			return (
				<Footage className={s.ill} src={THUMBS[1]}>
					<span className={s.capw}>
						{t('captionWords')
							.split(' ')
							.map((word, i) => (
								<span key={i}>{word}</span>
							))}
					</span>
				</Footage>
			)
		case 'text':
			return (
				<Footage className={s.ill}>
					<span className={s.ttl}>{t('titleCard')}</span>
					<span className={s.logoBox} />
				</Footage>
			)
		case 'annotate':
			return (
				<Footage className={s.ill} src={THUMBS[2]}>
					<span className={s.blur} />
				</Footage>
			)
		case 'frame':
			return (
				<Footage className={s.ill} src={THUMBS[0]}>
					<span className={s.crop} />
				</Footage>
			)
		case 'colour':
			return (
				<span className={cn(s.duo, s.ill, 'block')}>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img className={s.grade} src={PICTURE} alt="" loading="lazy" decoding="async" />
				</span>
			)
		case 'speed':
			return (
				<span className={s.ill}>
					<span className={s.spd}>
						{SPEEDS.map((speed, i) => (
							<i key={speed} data-on={i === 1 ? '' : undefined}>
								{speed}
							</i>
						))}
					</span>
				</span>
			)
		case 'highlights':
			return (
				<span className={s.ill}>
					{[PICTURE, THUMBS[0], THUMBS[1]].map((src, i) => (
						<Footage key={i} className={s.hl} src={src} />
					))}
				</span>
			)
		case 'export':
			return (
				<span className={s.ill}>
					<span className={s.exp}>
						{t('exportFile')}
						<small>{t('exporting')}</small>
					</span>
					<span className={s.bar}>
						<i />
					</span>
				</span>
			)
	}
}

export async function ToolTrack() {
	const t = await getTranslations('Site.landingPage.tools')
	return (
		<section id="features" className={s.editor} aria-label={t('label')} data-scene="editor">
			<div className={s.pin}>
				<div className={s.ed}>
					<div className={cn(s.wrap, s.edHead)}>
						<DisplayHeading className="max-w-[13ch]">{t('title')}</DisplayHeading>
						<Lead className="max-w-[44ch]">{t('lead')}</Lead>
					</div>
					<ul className={s.track} data-track>
						{TOOL_KEYS.map((tool) => (
							<li key={tool} className={s.tool}>
								<Illustration tool={tool} t={(key) => t(key)} />
								<span className={s.kicker}>{t(`cards.${tool}.kicker`)}</span>
								<h3>{t(`cards.${tool}.title`)}</h3>
								<p>{t(`cards.${tool}.body`)}</p>
							</li>
						))}
					</ul>
				</div>
			</div>
		</section>
	)
}

export async function Promises() {
	const t = await getTranslations('Site.landingPage.promises')
	return (
		<section className={cn(s.wrap, s.promises)} aria-labelledby="promises">
			<Eyebrow as="h2">
				<span id="promises">{t('eyebrow')}</span>
			</Eyebrow>
			<div className="mt-7">
				{PROMISE_KEYS.map((key) => (
					<div key={key} className={s.prom}>
						<h3 className="rt-reveal">{t(`items.${key}.title`)}</h3>
						<p className="rt-reveal">{t(`items.${key}.body`)}</p>
					</div>
				))}
			</div>
		</section>
	)
}

/** The questions people ask, each opening its answer below it (native details). */
export async function Questions({
	title,
	keys = FAQ_KEYS
}: {
	/** The heading; the landing page's own when not given. */
	title?: React.ReactNode
	/** Which of Site.faq.items to ask, in order. */
	keys?: readonly string[]
}) {
	const t = await getTranslations('Site')
	return (
		<section id="faq" className={cn(s.wrap, s.faq)} aria-labelledby="faq-title">
			<div className={s.faqGrid}>
				<DisplayHeading id="faq-title" className="text-[clamp(36px,4.6vw,64px)] leading-[0.98]">
					{title ?? t('landingPage.faqTitle')}
				</DisplayHeading>
				<div>
					{keys.map((key) => (
						<details key={key} className={s.qa}>
							<summary className="focus-visible:outline-accent rounded-md focus-visible:outline-2">
								{t(`faq.items.${key}.question`)}
							</summary>
							<p>{t(`faq.items.${key}.answer`)}</p>
						</details>
					))}
				</div>
			</div>
		</section>
	)
}
