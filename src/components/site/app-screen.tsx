import { getTranslations } from 'next-intl/server'
import {
	ArrowLeftIcon,
	ArticleIcon,
	AttachIcon,
	CaptionsIcon,
	CheckIcon,
	CleanupIcon,
	CopyIcon,
	ColourIcon,
	CropIcon,
	DarkModeIcon,
	DownloadIcon,
	DrawIcon,
	EditIcon,
	HighlightIcon,
	MergeIcon,
	MicIcon,
	MusicIcon,
	PlayIcon,
	ProjectsIcon,
	RedoIcon,
	ResetIcon,
	SearchIcon,
	SendIcon,
	SparkleIcon,
	SpeedIcon,
	SplitIcon,
	TextIcon,
	TransitionIcon,
	TrashIcon,
	UndoIcon,
	VideoIcon
} from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { LogoMark } from './logo'
import { CityScene, RidgeScene, SeaScene } from './scenes'

// A picture of Retake's editor, drawn as the design does at 1440 × 900 and
// scaled to whatever width it's given (.mock-frame in globals.css). The
// left panel shows one tool at a time: the assistant, clean up, the
// transcript or highlights. Decorative: hidden from screen readers, as its
// words are the page's own told another way.

export type AppScreenPanel = 'assistant' | 'cleanup' | 'transcript' | 'highlights'

const RAIL = [
	{ id: 'project', icon: ProjectsIcon },
	{ id: 'assistant', icon: SparkleIcon },
	{ id: 'transcript', icon: ArticleIcon },
	{ id: 'highlights', icon: HighlightIcon },
	{ group: 'fix' },
	{ id: 'cleanup', icon: CleanupIcon },
	{ group: 'add' },
	{ id: 'captions', icon: CaptionsIcon },
	{ id: 'text', icon: TextIcon },
	{ id: 'annotate', icon: DrawIcon },
	{ id: 'audio', icon: MusicIcon },
	{ id: 'videos', icon: VideoIcon },
	{ group: 'adjust' },
	{ id: 'frame', icon: CropIcon },
	{ id: 'colour', icon: ColourIcon },
	{ id: 'speed', icon: SpeedIcon },
	{ id: 'transitions', icon: TransitionIcon }
] as const

const TICKS = ['0:00', '0:15', '0:30', '0:45', '1:00', '1:15', '1:30', '1:45'] as const
/** Where the filler-word marks sit on the ruler (px from the lane's start), and which is picked. */
const FILLER_MARKS = [270, 286, 299, 510, 783, 799, 816, 833, 849, 866] as const

export async function AppScreen({
	panel,
	id,
	className
}: {
	panel: AppScreenPanel
	/** Unique on the page: the drawn scenes name their gradients by it. */
	id: string
	className?: string
}) {
	const t = await getTranslations('Site.mock')
	const tools = await getTranslations('Editor.tools')
	const zoomed = panel === 'assistant'
	return (
		<div
			aria-hidden
			inert
			className={cn(
				'mock-frame border-border bg-bg aspect-[1440/930] rounded-[22px] border shadow-(--shadow-card) select-none',
				className
			)}
			style={{ '--mock-width': '1440px' } as React.CSSProperties}
		>
			<div className="mock-canvas bg-bg text-text h-[930px] w-[1440px] font-sans">
				{/* The window's own bar. */}
				<div className="border-border flex h-[30px] items-center border-b px-3.5">
					<span className="flex gap-1.5">
						{[0, 1, 2].map((dot) => (
							<span key={dot} className="bg-border-strong size-2.5 rounded-full" />
						))}
					</span>
					<span className="bg-surface-hover text-text-faint mx-auto rounded-md px-3 py-0.5 text-[11px]">
						{t('address')}
					</span>
				</div>
				{/* The editor's top bar. */}
				<div className="border-border flex h-[60px] items-center gap-2.5 border-b px-4">
					<ArrowLeftIcon size={20} className="text-text-muted" />
					<LogoMark className="ml-2" />
					<span className="ml-1 flex items-center gap-1.5 text-base font-bold">
						{t('project')}
						<EditIcon size={14} className="text-text-faint" />
					</span>
					<span className="bg-success/12 text-success flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-bold">
						<CheckIcon size={12} />
						{t('saved')}
					</span>
					<div className="ml-[210px] flex items-center gap-2">
						<UndoIcon size={18} className="text-text-muted" />
						<RedoIcon size={18} className="text-text-faint" />
						<span className="text-text-muted flex h-[34px] items-center gap-1.5 px-3 text-[13.5px] font-semibold">
							<ResetIcon size={16} />
							{t('reset')}
						</span>
						<span className="border-border bg-glass flex rounded-[11px] border p-[3px]">
							<span className="bg-selected flex h-[30px] items-center rounded-lg px-3.5 text-[13.5px] font-extrabold">
								{t('edited')}
							</span>
							<span className="text-text-muted flex h-[30px] items-center px-3.5 text-[13.5px] font-semibold">
								{t('original')}
							</span>
						</span>
					</div>
					<span className="border-border bg-surface text-text-faint ml-auto flex h-9 w-[230px] items-center gap-2 rounded-[10px] border pr-2.5 pl-3 text-[13.5px]">
						<SearchIcon size={16} />
						{t('search')}
						<span className="border-border ml-auto rounded-[5px] border px-1.5 font-mono text-[11px]">
							⌘K
						</span>
					</span>
					<span className="border-border bg-glass relative h-7 w-12 rounded-full border">
						<span className="bg-brand absolute top-0.5 left-0.5 flex size-[22px] items-center justify-center rounded-full text-white">
							<DarkModeIcon size={12} />
						</span>
					</span>
					<span className="bg-brand flex h-[38px] items-center gap-1.5 rounded-[11px] px-4 text-sm font-extrabold text-white shadow-[0_10px_30px_-12px_var(--accent)]">
						<DownloadIcon size={16} />
						{t('export')}
					</span>
				</div>
				<div className="flex h-[840px]">
					{/* The tool rail. */}
					<div className="border-border flex w-20 shrink-0 flex-col items-center gap-0.5 border-r pt-3">
						{RAIL.map((item) =>
							'group' in item ? (
								<span
									key={item.group}
									className="text-text-faint mt-2 mb-1 text-[9.5px] font-bold tracking-[0.14em] uppercase"
								>
									{tools(`groups.${item.group}`)}
								</span>
							) : (
								<span
									key={item.id}
									className={cn(
										'flex w-[63px] flex-col items-center gap-1 rounded-xl px-0.5 pt-[7px] pb-1.5 text-center text-[10.5px] leading-tight',
										item.id === panel
											? 'bg-accent-soft text-accent-fg font-extrabold'
											: 'text-text-muted font-semibold'
									)}
								>
									<item.icon size={18} />
									{tools(`rail.${item.id}.label`)}
								</span>
							)
						)}
					</div>
					{/* The open tool's panel. */}
					<div className="bg-surface border-border flex w-[340px] shrink-0 flex-col border-r">
						<Panel panel={panel} t={t} tools={tools} />
					</div>
					{/* The picture, its controls and the timeline. */}
					<div className="flex min-w-0 flex-1 flex-col gap-3 px-4 pt-3.5 pb-4">
						<div className="relative mx-auto h-[490px] w-[871px] overflow-hidden rounded-2xl bg-black shadow-[0_30px_80px_-30px_rgb(0_0_0/0.75),0_0_0_1px_rgb(255_255_255/0.08)]">
							<RidgeScene id={`${id}-picture`} className={cn(zoomed && 'scale-[1.3]')} />
							{zoomed && (
								<>
									<span className="border-zoom absolute top-[88px] left-[192px] h-[284px] w-[488px] rounded-[10px] border-2 shadow-[0_0_0_999px_rgb(0_0_0/0.3)]" />
									<span className="bg-zoom text-ink absolute top-[58px] left-[192px] rounded-[7px] px-[9px] py-[3px] text-[12.5px] font-extrabold">
										{t('assistant.zoomTag')}
									</span>
								</>
							)}
							<span className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-lg bg-black/55 px-3.5 py-1.5 text-[22px] font-extrabold tracking-[-0.01em] whitespace-nowrap text-white">
								{t.rich('caption', {
									hl: (chunks) => <span className="text-zoom">{chunks}</span>
								})}
							</span>
						</div>
						<div className="flex items-center px-1.5">
							<span className="font-mono text-sm font-semibold">{t('time')}</span>
							<span className="ml-auto flex items-center gap-5">
								<UndoIcon size={18} className="text-text-muted" />
								<span className="text-ink flex size-[46px] items-center justify-center rounded-full bg-white shadow-[0_8px_24px_-10px_rgb(0_0_0/0.5)]">
									<PlayIcon size={18} />
								</span>
								<RedoIcon size={18} className="text-text-muted" />
							</span>
							<span className="bg-glass ml-auto flex rounded-[9px] p-0.5 text-xs">
								{['0.5×', '1×', '1.5×', '2×'].map((speed) => (
									<span
										key={speed}
										className={cn(
											'rounded-[7px] px-[7px] py-[3px]',
											speed === '1×'
												? 'bg-surface-hover font-extrabold'
												: 'text-text-muted font-semibold'
										)}
									>
										{speed}
									</span>
								))}
							</span>
						</div>
						<Timeline t={t} id={id} />
					</div>
				</div>
			</div>
		</div>
	)
}

type Translate = Awaited<ReturnType<typeof getTranslations<'Site.mock'>>>
type ToolsTranslate = Awaited<ReturnType<typeof getTranslations<'Editor.tools'>>>

function PanelHeading({ title, help }: { title: string; help: string }) {
	return (
		<div className="flex flex-col gap-1 px-5 pt-5">
			<span className="text-lg font-extrabold tracking-[-0.01em]">{title}</span>
			<span className="text-text-muted text-[13px]">{help}</span>
		</div>
	)
}

function Panel({
	panel,
	t,
	tools
}: {
	panel: AppScreenPanel
	t: Translate
	tools: ToolsTranslate
}) {
	if (panel === 'assistant') {
		return (
			<>
				<PanelHeading title={tools('rail.assistant.label')} help={tools('rail.assistant.help')} />
				<div className="flex flex-1 flex-col gap-4 px-5 pt-4">
					<span className="bg-brand ml-auto max-w-[257px] rounded-[16px_16px_4px_16px] px-3.5 py-2.5 text-sm font-semibold text-white">
						{t('assistant.ask')}
					</span>
					<div className="border-accent/50 bg-accent-soft flex flex-col gap-2 rounded-[16px_16px_16px_4px] border p-3.5">
						<span className="text-accent-fg flex items-center gap-1.5 text-[11.5px] font-bold tracking-[0.08em] uppercase">
							<SparkleIcon size={12} />
							{t('assistant.heading')}
						</span>
						<p className="text-[15px] leading-[1.4] font-bold">{t('assistant.plan')}</p>
						<p className="text-text-muted text-[12.5px]">{t('assistant.note')}</p>
						<div className="mt-1 flex gap-2">
							<span className="border-border-strong flex h-9 flex-1 items-center justify-center rounded-[10px] border text-[13.5px] font-bold">
								{t('assistant.cancel')}
							</span>
							<span className="bg-brand flex h-9 flex-[1.3] items-center justify-center rounded-[10px] text-[13.5px] font-extrabold text-white">
								{t('assistant.apply')}
							</span>
						</div>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{[0, 1, 2].map((index) => (
							<span
								key={index}
								className="border-border text-text-muted rounded-full border px-2.5 py-1.5 text-xs"
							>
								{t(`assistant.suggestions.${index}`)}
							</span>
						))}
					</div>
				</div>
				<div className="border-border border-t px-4 pt-3 pb-4">
					<div className="border-border-strong bg-surface-inset flex h-[113px] flex-col rounded-2xl border p-3">
						<span className="text-text-faint text-sm">{t('assistant.placeholder')}</span>
						<span className="text-text-muted mt-auto flex items-center gap-3">
							<AttachIcon size={16} />
							<MicIcon size={16} />
							<span className="bg-brand ml-auto flex size-[34px] items-center justify-center rounded-full text-white">
								<SendIcon size={15} />
							</span>
						</span>
					</div>
				</div>
			</>
		)
	}
	if (panel === 'cleanup') {
		return (
			<>
				<PanelHeading title={tools('rail.cleanup.label')} help={tools('rail.cleanup.help')} />
				<div className="flex flex-col gap-3 px-5 pt-4">
					<div className="border-border bg-surface-inset flex flex-col gap-2 rounded-xl border p-3.5 text-[13px]">
						<span className="flex items-center gap-2">
							<span className="bg-warning size-1.5 rounded-full" />
							{t('cleanup.pauses')}
							<span className="ml-auto font-bold">3</span>
						</span>
						<span className="flex items-center gap-2">
							<span className="bg-filler size-1.5 rounded-full" />
							{t('cleanup.fillers')}
							<span className="ml-auto font-bold">1</span>
						</span>
						<span className="border-border mt-1 border-t pt-2 font-bold">{t('cleanup.saves')}</span>
					</div>
					<span className="bg-brand flex h-10 items-center justify-center gap-1.5 rounded-[10px] text-[13.5px] font-extrabold text-white">
						<CleanupIcon size={15} />
						{t('cleanup.remove')}
					</span>
					<span className="text-text-faint text-xs">{t('cleanup.note')}</span>
					<div className="border-filler/50 bg-filler/8 mt-2 flex flex-col gap-2.5 rounded-xl border p-3.5">
						<span className="text-filler text-[11.5px] font-bold tracking-[0.08em] uppercase">
							{t('cleanup.cut')}
						</span>
						<span className="flex h-8 items-end gap-[3px]">
							{Array.from({ length: 34 }, (_, bar) => (
								<span
									key={bar}
									className={cn(
										'w-[5px] rounded-full',
										bar > 14 && bar < 22 ? 'bg-filler' : 'bg-text-faint'
									)}
									style={{ height: `${30 + ((bar * 37) % 70)}%` }}
								/>
							))}
						</span>
						<span className="border-filler/50 text-filler self-start rounded-lg border px-2.5 py-1 text-xs font-extrabold">
							{t('cleanup.review')}
						</span>
					</div>
				</div>
			</>
		)
	}
	if (panel === 'transcript') {
		return (
			<>
				<PanelHeading title={tools('rail.transcript.label')} help={tools('rail.transcript.help')} />
				<ol className="flex flex-col gap-1 px-3 pt-4">
					{[0, 1, 2, 3].map((line) => (
						<li
							key={line}
							className={cn(
								'flex gap-3 rounded-xl px-2.5 py-2 text-[14px] leading-snug',
								line === 3 && 'bg-accent-soft'
							)}
						>
							<span className="text-accent-fg w-9 shrink-0 font-mono text-xs leading-5">
								{`0:${String(line * 9).padStart(2, '0')}`}
							</span>
							<span>{t(`transcript.lines.${line}`)}</span>
						</li>
					))}
				</ol>
			</>
		)
	}
	return (
		<>
			<PanelHeading title={tools('rail.highlights.label')} help={tools('rail.highlights.help')} />
			<span className="text-text-muted px-5 pt-4 text-[13px] font-bold">
				{t('highlights.found')}
			</span>
			<ul className="flex flex-col gap-2.5 px-5 pt-3">
				{[0, 1, 2].map((item) => (
					<li
						key={item}
						className="border-border bg-surface-inset flex items-center gap-3 rounded-xl border p-2.5"
					>
						<span className="h-[72px] w-[42px] shrink-0 overflow-hidden rounded-md">
							<RidgeScene id={`highlight-${item}`} />
						</span>
						<span className="flex flex-col gap-1.5">
							<span className="text-[13.5px] font-bold">{t(`highlights.items.${item}`)}</span>
							<span className="flex gap-1.5 text-[11px]">
								<span className="bg-brand flex items-center gap-1 rounded-md px-2 py-1 font-extrabold text-white">
									<DownloadIcon size={11} />
									{t('highlights.download')}
								</span>
								<span className="border-border-strong rounded-md border px-2 py-1 font-bold">
									{t('highlights.vertical')}
								</span>
							</span>
						</span>
					</li>
				))}
			</ul>
		</>
	)
}

function Timeline({ t, id }: { t: Translate; id: string }) {
	const lane = 'text-text-faint w-[68px] shrink-0 text-xs font-bold'
	return (
		<div className="border-border bg-surface relative flex flex-col gap-1.5 rounded-[18px] border px-3 pt-2 pb-3">
			<div className="flex h-8 items-center gap-5 px-1 text-[13px] font-bold">
				<span className="flex items-center gap-1.5">
					<SplitIcon size={15} />
					{t('split')}
				</span>
				<span className="text-text-faint flex items-center gap-1.5">
					<MergeIcon size={15} />
					{t('merge')}
				</span>
				<span className="flex items-center gap-1.5">
					<CopyIcon size={15} />
					{t('duplicate')}
				</span>
				<span className="flex items-center gap-1.5">
					<TrashIcon size={15} />
					{t('delete')}
				</span>
				<span className="bg-border h-5 w-px" />
				<span className="text-text-faint text-[12.5px] font-normal">{t('drag')}</span>
				<span className="text-text-muted ml-auto text-[12.5px]">{t('clips')}</span>
				<span className="bg-filler/13 text-filler flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold">
					<span className="bg-filler size-1.5 rounded-full" />
					{t('fillers')}
				</span>
				<span className="text-text-faint text-xs font-normal">{t('zoom')}</span>
				<span className="bg-track relative h-1 w-24 rounded-full">
					<span className="bg-text-muted absolute inset-y-0 left-0 w-[29px] rounded-full" />
					<span className="absolute -top-[5px] left-[22px] size-3.5 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.4)]" />
				</span>
			</div>
			<div className="relative ml-[68px] h-[30px]">
				{TICKS.map((tick, index) => (
					<span
						key={tick}
						className="text-text-faint border-border absolute top-0 border-l pl-1 font-mono text-[10.5px]"
						style={{ left: `${index * 124}px` }}
					>
						{tick}
					</span>
				))}
				{FILLER_MARKS.map((left, index) => (
					<span
						key={left}
						className={cn(
							'border-filler absolute top-[19px] size-[7px] rounded-full border',
							index === 2 && 'bg-filler'
						)}
						style={{ left: `${left}px` }}
					/>
				))}
			</div>
			<div className="flex items-center">
				<span className={lane}>{t('lanes.video')}</span>
				<div className="flex h-[54px] flex-1 gap-[3px]">
					{(
						[
							['intro', '0:28', 229, RidgeScene],
							['climb', '0:46', 378, SeaScene],
							['ocean', '0:34', 278, CityScene]
						] as const
					).map(([clip, length, width, Scene]) => (
						<span
							key={clip}
							className={cn(
								'relative overflow-hidden rounded-[10px]',
								clip === 'climb' && 'shadow-[0_0_0_2px_white]'
							)}
							style={{ width: `${width}px` }}
						>
							<Scene id={`${id}-${clip}`} className="absolute inset-0" />
							<span className="absolute inset-0 bg-linear-to-r from-black/60 to-black/15" />
							<span className="absolute top-1.5 left-2.5 text-[12.5px] font-extrabold text-white">
								{t(`clipNames.${clip}`)}
							</span>
							<span className="absolute bottom-1.5 left-2.5 font-mono text-[10.5px] text-white/80">
								{length}
							</span>
							{clip === 'climb' && (
								<>
									<span className="absolute inset-y-0 left-0 w-[7px] bg-white" />
									<span className="absolute inset-y-0 right-0 w-[7px] bg-white" />
								</>
							)}
						</span>
					))}
				</div>
			</div>
			<div className="flex items-center">
				<span className={lane}>{t('lanes.text')}</span>
				<div className="relative h-[26px] flex-1">
					{(
						[
							['title', 0, 50],
							['day', 157, 83],
							['light', 381, 74]
						] as const
					).map(([text, left, width]) => (
						<span
							key={text}
							className="border-accent/50 bg-accent-soft text-accent-fg absolute h-[26px] truncate rounded-lg border px-2 text-[11.5px] leading-6 font-bold"
							style={{ left: `${left}px`, width: `${width}px` }}
						>
							{t(`texts.${text}`)}
						</span>
					))}
				</div>
			</div>
			<div className="flex items-center">
				<span className={lane}>{t('lanes.captions')}</span>
				<span className="border-border bg-glass text-text-muted h-6 flex-1 rounded-lg border px-2.5 text-[11.5px] leading-[22px] font-semibold">
					{t('captionsLane')}
				</span>
			</div>
			<div className="flex items-center">
				<span className={lane}>{t('lanes.audio')}</span>
				<span className="border-accent/50 bg-accent-soft relative h-7 flex-1 overflow-hidden rounded-lg border">
					<span className="absolute inset-x-2 inset-y-1 bg-[repeating-linear-gradient(90deg,rgb(109_91_255/0.5)_0_2px,transparent_2px_5px)]" />
					<span className="text-accent-fg relative ml-2.5 text-[11px] leading-[26px] font-extrabold">
						{t('music')}
					</span>
				</span>
			</div>
			<span className="bg-accent pointer-events-none absolute top-[52px] bottom-3 left-[229px] w-0.5" />
			<span className="bg-accent absolute top-12 left-[224px] size-3 rounded-[4px_4px_50%_50%]" />
		</div>
	)
}
