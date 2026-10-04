import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
	'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				primary: 'bg-accent text-accent-ink font-semibold shadow-sm hover:bg-accent-hover',
				secondary:
					'border border-border bg-surface-hover text-text hover:border-border-strong hover:bg-border',
				outline:
					'border border-border bg-surface text-text hover:border-border-strong hover:bg-surface-hover',
				ghost: 'bg-transparent text-text-muted hover:bg-surface-hover hover:text-text',
				destructive: 'bg-danger text-white hover:opacity-90'
			},
			size: {
				sm: 'h-8 px-3 text-sm',
				default: 'h-9 px-4 text-sm',
				lg: 'h-11 px-6 text-base',
				icon: 'size-9'
			}
		},
		defaultVariants: {
			variant: 'primary',
			size: 'default'
		}
	}
)

type ButtonProps = React.ComponentProps<'button'> &
	VariantProps<typeof buttonVariants> & {
		// Renders as its child (e.g. next-intl's <Link>) instead of a <button>
		// — keeps the same classes/focus styles without nesting an <a> inside
		// a <button>. See https://www.radix-ui.com/primitives/docs/utilities/slot.
		asChild?: boolean
	}

// No forwardRef — React 19 accepts `ref` as a normal prop on function
// components now, and React.ComponentProps<'button'> already includes it.
export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
	const Comp = asChild ? Slot : 'button'
	return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
