import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

// success/warning/danger use a tinted background with the token as text
// color rather than a solid fill with white text — a solid danger/warning
// fill can fail WCAG contrast against white in dark mode where those tokens
// are brighter (see DESIGN.md's accessibility baseline); a tint of the same
// hue can't fail contrast against its own darker/lighter text by
// construction.
const badgeVariants = cva(
	'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
	{
		variants: {
			variant: {
				default: 'border-transparent bg-accent text-accent-ink',
				secondary: 'border-transparent bg-surface-hover text-text',
				success: 'border-transparent bg-success/15 text-success',
				warning: 'border-transparent bg-warning/15 text-warning',
				danger: 'border-transparent bg-danger/15 text-danger',
				outline: 'border-border text-text'
			}
		},
		defaultVariants: { variant: 'default' }
	}
)

type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
	return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
