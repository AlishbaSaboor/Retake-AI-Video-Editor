import { getTranslations } from 'next-intl/server'
import { CheckIcon, MicIcon, SparkleIcon } from '@/components/ui/icons'

// Clip widths on the drawn timeline, in percent; the third is cut away.
const CLIPS = [34, 22, 9, 35] as const
const CUT_CLIP = 2
const WAVE = [3, 6, 4, 8, 5, 9, 7, 4, 6, 3, 7, 9, 5, 4, 8, 6, 3, 5, 7, 4, 6, 8, 5, 3]

/** A drawing of the editor for the landing page: the chat, the picture, the timeline. Decorative. */
export async function EditorPreview() {
	const t = await getTranslations('Site.landing.preview')
	return (
		<div
			aria-hidden
			className="border-border bg-surface relative overflow-hidden rounded-lg border shadow-2xl"
		>
			<div className="border-border flex items-center gap-1.5 border-b px-4 py-3">
				<span className="bg-border-strong size-2.5 rounded-full" />
				<span className="bg-border-strong size-2.5 rounded-full" />
				<span className="bg-border-strong size-2.5 rounded-full" />
				<span className="text-text-faint ml-3 font-mono text-xs">{t('file')}</span>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-[15rem_minmax(0,1fr)]">
				<div className="border-border hidden flex-col gap-3 border-r p-4 sm:flex">
					<p className="bg-surface-hover text-text self-end rounded-lg rounded-br-sm px-3 py-2 text-sm">
						{t('ask')}
					</p>
					<div className="border-border bg-surface-inset flex flex-col gap-2 rounded-lg border p-3 text-sm">
						<p className="text-text flex items-center gap-2 font-medium">
							<SparkleIcon className="text-accent" />
							{t('understood')}
						</p>
						<p className="text-text-muted">{t('detail')}</p>
						<div className="flex gap-2">
							<span className="bg-accent text-accent-ink rounded-md px-2.5 py-1 text-xs font-semibold">
								{t('apply')}
							</span>
							<span className="border-border text-text-muted rounded-md border px-2.5 py-1 text-xs">
								{t('cancel')}
							</span>
						</div>
					</div>
					<div className="border-border text-text-faint mt-auto flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
						{t('typeHere')}
						<MicIcon className="text-accent" />
					</div>
				</div>
				<div className="flex flex-col gap-4 p-4">
					<div className="relative aspect-video overflow-hidden rounded-lg bg-black">
						<div className="from-accent/25 absolute inset-0 bg-gradient-to-br via-transparent to-transparent" />
						<div className="absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 ring-1 ring-white/20" />
						<p className="absolute right-0 bottom-[8%] left-0 text-center text-sm font-semibold text-white drop-shadow">
							{t('caption')}
						</p>
						<span className="absolute top-3 right-3 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 font-mono text-[10px] text-white">
							<CheckIcon size={12} />
							{t('saved')}
						</span>
					</div>
					<div className="flex flex-col gap-2">
						<div className="flex h-10 gap-1">
							{CLIPS.map((width, index) => (
								<div
									key={index}
									style={{ width: `${width}%` }}
									className={
										index === CUT_CLIP
											? 'border-danger/60 bg-danger/10 rounded-md border border-dashed'
											: 'border-accent/40 bg-accent-soft flex items-center gap-[3px] overflow-hidden rounded-md border px-2'
									}
								>
									{index !== CUT_CLIP &&
										WAVE.map((height, bar) => (
											<span
												key={bar}
												style={{ height: `${height * 3}px` }}
												className="bg-accent/70 w-[3px] shrink-0 rounded-full"
											/>
										))}
								</div>
							))}
						</div>
						<div className="text-text-faint flex justify-between font-mono text-[10px]">
							<span>00:00</span>
							<span>00:15</span>
							<span>00:30</span>
							<span>00:45</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
