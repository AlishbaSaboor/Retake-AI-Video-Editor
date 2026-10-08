import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { CaptionsIcon, CheckIcon, SendIcon, UndoIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

const PLAN_DOTS = ['bg-brand-violet', 'bg-brand-purple', 'bg-brand-blue', 'bg-brand-lilac'] as const

/**
 * The landing page's window onto Retake: a project with its picture and
 * timeline (two filler words flagged on it), the assistant asked for a reel
 * and its plan applied; three notes float around it. Decorative.
 */
export async function HeroDemo() {
	const t = await getTranslations('Site.landing')
	return (
		<div aria-hidden inert className="relative mx-auto w-full max-w-[1180px] select-none">
			<div className="border-glass-border bg-surface overflow-hidden rounded-[28px] border shadow-(--shadow-card)">
				<div className="border-border flex h-9 items-center border-b px-4">
					<span className="flex gap-2">
						{[0, 1, 2].map((dot) => (
							<span key={dot} className="bg-border-strong size-2.5 rounded-full" />
						))}
					</span>
					<span className="bg-surface-hover text-text-muted mx-auto rounded-md px-4 py-0.5 text-xs">
						{t('demo.window')}
					</span>
				</div>
				<div className="border-border flex h-12 items-center gap-2 border-b px-4 text-sm">
					<span className="font-extrabold">{t('demo.project')}</span>
					<span className="text-text-faint text-[13px]">· {t('demo.saved')}</span>
					<span className="text-text-muted ml-auto hidden items-center gap-2 text-[13px] sm:flex">
						<span className="border-accent-fg size-3 animate-spin rounded-full border-2 border-r-transparent motion-reduce:animate-none" />
						{t('demo.planning')}
					</span>
					<span className="bg-brand ml-3 rounded-lg px-3 py-1 text-[13px] font-extrabold text-white">
						{t('demo.export')}
					</span>
				</div>
				<div className="grid md:grid-cols-[1fr_310px]">
					<div className="flex flex-col">
						<div className="bg-surface-inset flex justify-center px-6 py-7 md:px-14">
							<div className="aspect-[4/3] w-full max-w-[540px] overflow-hidden rounded-2xl">
								<Image
									src="/site/clip/hero-picture.webp"
									alt=""
									width={HERO_PICTURE.width}
									height={HERO_PICTURE.height}
									sizes="(min-width: 1024px) 540px, 90vw"
									quality={IMAGE_QUALITY}
									priority
									className="size-full object-cover"
								/>
							</div>
						</div>
						<div className="border-border relative flex flex-col gap-2.5 border-t px-4 py-4 text-xs font-semibold">
							<div className="flex items-center gap-3">
								<span className="text-text-muted w-16 shrink-0">{t('demo.lanes.video')}</span>
								<div className="flex h-10 flex-1 gap-1">
									<span className="flex-[2] overflow-hidden rounded-md">
										<Thumb n={1} />
									</span>
									<span className="border-filler text-filler bg-filler/15 flex w-9 items-center justify-center rounded-md border text-[11px]">
										{t('demo.um')}
									</span>
									<span className="flex-[2.6] overflow-hidden rounded-md">
										<Thumb n={2} />
									</span>
									<span className="border-filler text-filler bg-filler/15 flex w-9 items-center justify-center rounded-md border text-[11px]">
										{t('demo.uh')}
									</span>
									<span className="flex-[2] overflow-hidden rounded-md">
										<Thumb n={3} />
									</span>
								</div>
							</div>
							<div className="flex items-center gap-3">
								<span className="text-text-muted w-16 shrink-0">{t('demo.lanes.captions')}</span>
								<span className="bg-surface-hover h-4 flex-1 rounded" />
							</div>
							<div className="flex items-center gap-3">
								<span className="text-text-muted w-16 shrink-0">{t('demo.lanes.music')}</span>
								<span className="h-4 flex-[0.9] rounded bg-[repeating-linear-gradient(90deg,rgb(76_125_255/0.8)_0_2px,transparent_2px_5px)]" />
								<span className="flex-[0.1]" />
							</div>
							<span className="absolute top-2 bottom-2 left-[22%] w-0.5 bg-white">
								<span className="absolute -top-1 -left-[3px] size-2 rounded-sm bg-white" />
							</span>
						</div>
					</div>
					<div className="border-border hidden flex-col gap-4 border-l p-4 md:flex">
						<span className="text-sm font-extrabold">{t('demo.assistant')}</span>
						<span className="bg-brand ml-auto rounded-xl px-3 py-1.5 text-[13px] font-bold text-white">
							{t('demo.ask')}
						</span>
						<div className="border-border bg-surface-inset flex flex-col gap-2 rounded-xl border p-3.5">
							<span className="text-accent-fg text-[13px] font-bold">{t('demo.planTitle')}</span>
							<ul className="flex flex-col gap-1 text-[13px]">
								{PLAN_DOTS.map((dot, index) => (
									<li key={dot} className="flex items-center gap-2">
										<span className={cn(dot, 'size-1.5 rounded-full')} />
										{t(`demo.plan.${index}`)}
									</li>
								))}
							</ul>
							<span className="bg-accent-soft mt-1 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px]">
								<CheckIcon size={13} className="text-accent-fg" />
								<span className="text-accent-fg font-bold">{t('demo.applied')}</span>
								<span className="ml-auto underline">{t('demo.undo')}</span>
							</span>
						</div>
						<div className="border-border mt-auto flex flex-col gap-3 rounded-xl border p-3">
							<span className="text-text-faint text-[13px]">{t('demo.placeholder')}</span>
							<span className="flex items-center gap-1.5 text-[11px]">
								<span className="bg-surface-hover rounded-md px-1.5 py-0.5">{t('demo.speak')}</span>
								<span className="bg-surface-hover rounded-md px-1.5 py-0.5">
									{t('demo.attach')}
								</span>
								<span className="bg-accent ml-auto flex size-7 items-center justify-center rounded-lg text-white">
									<SendIcon size={13} />
								</span>
							</span>
						</div>
					</div>
				</div>
			</div>
			<Chip className="-top-6 right-2 rotate-2 md:-right-10" icon={<CaptionsIcon size={15} />}>
				{t('chips.captions')}
			</Chip>
			<Chip
				className="top-[38%] -left-2 -rotate-3 md:-left-10"
				icon={<CheckIcon size={15} />}
				iconClass="bg-brand-blue"
				delay
			>
				{t('chips.fillers')}
			</Chip>
			<Chip
				className="-bottom-8 left-6 rotate-2 max-md:hidden"
				icon={<UndoIcon size={15} />}
				iconClass="bg-brand-lilac text-ink"
			>
				{t('chips.undo')}
			</Chip>
		</div>
	)
}

/** The hero picture's file: 2x the 540 × 405 it's shown at, from the full-resolution clip. */
const HERO_PICTURE = { width: 1080, height: 810 }
/** The timeline thumbnails' files: 2x their widest (265 × 40 at 1440). */
const THUMB = { width: 640, height: 360 }
/** WebP quality for the clip's stills; next.config.ts allows it. */
const IMAGE_QUALITY = 85

/** A clip on the window's timeline: a still of the footage at its moment. */
function Thumb({ n }: { n: 1 | 2 | 3 }) {
	return (
		<Image
			src={`/site/clip/thumb-${n}.webp`}
			alt=""
			width={THUMB.width}
			height={THUMB.height}
			sizes="280px"
			quality={IMAGE_QUALITY}
			className="size-full object-cover"
		/>
	)
}

function Chip({
	children,
	icon,
	className,
	iconClass = 'bg-brand',
	delay = false
}: {
	children: React.ReactNode
	icon: React.ReactNode
	className?: string
	iconClass?: string
	delay?: boolean
}) {
	return (
		<span className={cn('absolute z-10', className)}>
			<span
				className={cn(
					'rt-float border-glass-border bg-surface/90 flex items-center gap-2.5 rounded-2xl border py-2.5 pr-4 pl-2.5 text-[15px] font-bold shadow-(--shadow-card) backdrop-blur-xl',
					delay && '[animation-delay:-3s]'
				)}
			>
				<span
					className={cn('flex size-7 items-center justify-center rounded-lg text-white', iconClass)}
				>
					{icon}
				</span>
				{children}
			</span>
		</span>
	)
}
