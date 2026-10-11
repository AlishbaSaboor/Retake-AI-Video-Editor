import { useTranslations } from 'next-intl'
import { InfoIcon } from '@/components/ui/icons'

/**
 * A tool's longer explanation, folded behind "How this works": there when
 * wanted, out of the way of the controls the rest of the time.
 */
export function MoreInfo({ children }: { children: React.ReactNode }) {
	const t = useTranslations('Editor.tools')
	return (
		<details className="group text-xs">
			<summary className="text-text-faint hover:text-text focus-visible:outline-accent inline-flex cursor-pointer list-none items-center gap-1.5 rounded focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
				<InfoIcon size={14} />
				{t('howItWorks')}
			</summary>
			<p className="text-text-muted mt-2 leading-relaxed">{children}</p>
		</details>
	)
}
