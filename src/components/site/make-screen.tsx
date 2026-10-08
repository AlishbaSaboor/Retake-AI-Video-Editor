import { getTranslations } from 'next-intl/server'
import {
	ArrowRightIcon,
	CaptionsIcon,
	CheckIcon,
	CropIcon,
	MusicIcon,
	PlusIcon,
	ProjectsIcon,
	SignOutIcon,
	SparkleIcon,
	TextIcon,
	TimingIcon,
	VideoIcon
} from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { LogoMark } from './logo'
import { RidgeScene } from './scenes'

const ROWS = [
	{ key: 'length', icon: TimingIcon },
	{ key: 'shape', icon: CropIcon },
	{ key: 'captions', icon: CaptionsIcon },
	{ key: 'screen', icon: TextIcon },
	{ key: 'motion', icon: VideoIcon },
	{ key: 'music', icon: MusicIcon }
] as const

/**
 * A picture of Make it's plan, as the app shows it before anything is
 * applied: the vertical preview and the plan, row by row. Drawn at
 * 1200 × 780 and scaled to fit, like AppScreen. Decorative.
 */
export async function MakeScreen({ className }: { className?: string }) {
	const t = await getTranslations('Site.mock')
	const nav = await getTranslations('Site.nav')
	return (
		<div
			aria-hidden
			inert
			className={cn(
				'mock-frame border-border bg-bg aspect-[1200/780] rounded-[18px] border select-none',
				className
			)}
			style={{ '--mock-width': '1200px' } as React.CSSProperties}
		>
			<div className="mock-canvas bg-bg bg-glow text-text h-[780px] w-[1200px] font-sans">
				<div className="border-border flex h-[30px] items-center border-b px-3.5">
					<span className="flex gap-1.5">
						{[0, 1, 2].map((dot) => (
							<span key={dot} className="bg-border-strong size-2.5 rounded-full" />
						))}
					</span>
					<span className="bg-surface-hover text-text-faint mx-auto rounded-md px-3 py-0.5 text-[11px]">
						{t('makeAddress')}
					</span>
				</div>
				<div className="border-border flex h-[60px] items-center gap-2 border-b px-6 text-sm font-bold">
					<LogoMark />
					<span className="mr-4 font-serif text-[26px] font-normal">Retake</span>
					<span className="bg-surface-hover flex h-[34px] items-center gap-1.5 rounded-[11px] px-3">
						<PlusIcon size={15} />
						{nav('newProject')}
					</span>
					<span className="text-text-muted flex items-center gap-1.5 px-3">
						<ProjectsIcon size={15} />
						{nav('projects')}
					</span>
					<span className="border-border bg-glass relative ml-auto h-7 w-12 rounded-full border">
						<span className="bg-brand absolute top-0.5 left-0.5 size-[22px] rounded-full" />
					</span>
					<span className="bg-surface-hover ml-3 flex size-[30px] items-center justify-center rounded-full text-xs font-extrabold">
						A
					</span>
					<span className="text-text-muted flex items-center gap-1.5 px-2">
						<SignOutIcon size={15} />
						{nav('signOut')}
					</span>
				</div>
				<div className="flex items-center justify-center gap-3 pt-7 text-[13px] font-bold">
					{[0, 1, 2].map((step) => (
						<span key={step} className="flex items-center gap-3">
							<span className="flex items-center gap-2">
								<span
									className={cn(
										'flex size-6 items-center justify-center rounded-full text-xs',
										step === 2 ? 'bg-accent text-white' : 'bg-success/15 text-success'
									)}
								>
									{step === 2 ? '3' : <CheckIcon size={12} />}
								</span>
								{t(`plan.steps.${step}`)}
							</span>
							{step < 2 && <span className="bg-success h-0.5 w-12 rounded-full" />}
						</span>
					))}
				</div>
				<div className="flex justify-center gap-6 pt-7">
					<div className="flex flex-col items-center gap-2">
						<div className="relative h-[440px] w-[248px] overflow-hidden rounded-[18px] border border-white/20 bg-black">
							<RidgeScene id="make-screen" className="absolute inset-0 opacity-0" />
							<span className="text-ink absolute top-3 left-3 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider uppercase">
								{t('plan.preview')}
							</span>
							<span className="absolute inset-x-0 top-12 text-center font-serif text-[30px] leading-[0.95] text-white">
								{t.rich('plan.titleCard', {
									em: (chunks) => <em className="block italic">{chunks}</em>
								})}
							</span>
							<span className="absolute inset-x-0 top-[62%] text-center text-[26px] font-extrabold text-white">
								{t('plan.word')}
							</span>
						</div>
						<span className="text-text-faint text-[11px]">{t('plan.previewNote')}</span>
					</div>
					<div className="border-border bg-surface flex w-[560px] flex-col gap-4 rounded-[20px] border p-6">
						<div className="flex items-center justify-between">
							<span className="text-accent-fg flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.12em] uppercase">
								<SparkleIcon size={12} />
								{t('plan.label')}
							</span>
							<span className="bg-surface-hover text-text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">
								{t('plan.notApplied')}
							</span>
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-[25px] leading-tight font-extrabold tracking-[-0.02em]">
								{t('plan.title')}
							</span>
							<span className="text-text-muted text-[13px]">{t('plan.summary')}</span>
						</div>
						<div className="grid grid-cols-2 gap-2.5">
							{ROWS.map(({ key, icon: Icon }) => (
								<span
									key={key}
									className={cn(
										'border-border bg-surface-inset flex items-start gap-3 rounded-xl border p-3',
										key === 'music' && 'border-border-strong'
									)}
								>
									<span className="bg-accent-soft text-accent-fg flex size-8 shrink-0 items-center justify-center rounded-lg">
										<Icon size={15} />
									</span>
									<span className="flex flex-col text-[11px]">
										<span className="text-text-faint">{t(`plan.rows.${key}.label`)}</span>
										<span className="text-[13px] font-extrabold">
											{t(`plan.rows.${key}.value`)}
										</span>
										<span className="text-text-faint">{t(`plan.rows.${key}.note`)}</span>
									</span>
								</span>
							))}
						</div>
						<div className="bg-success/10 flex flex-col gap-1 rounded-xl p-3 text-[12px]">
							<span className="text-success flex items-center gap-1.5 font-extrabold">
								<CheckIcon size={12} />
								{t('plan.checked')}
							</span>
							<span className="text-text-muted">{t('plan.checkedBody')}</span>
						</div>
						<div className="flex items-center gap-2 text-[13px] font-bold">
							<span className="bg-brand flex h-9 items-center gap-1.5 rounded-[10px] px-4 font-extrabold text-white">
								{t('plan.apply')}
								<ArrowRightIcon size={14} />
							</span>
							<span className="border-border-strong flex h-9 items-center rounded-[10px] border px-3.5">
								{t('plan.change')}
							</span>
							<span className="text-text-muted ml-auto px-2">{t('plan.cancel')}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

/** The rounded device a picture of the app sits in, with a soft glow behind. */
export function Device({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				'border-border-strong bg-surface-raised relative rounded-[30px] border p-3 shadow-(--shadow-card)',
				className
			)}
		>
			<span
				aria-hidden
				className="bg-accent-glow pointer-events-none absolute -inset-8 -z-10 rounded-full opacity-60 blur-3xl"
			/>
			{children}
		</div>
	)
}
