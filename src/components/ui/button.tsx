import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
	'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-bold whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				primary:
					'rt-btn bg-brand text-accent-ink font-extrabold shadow-[0_14px_36px_-14px_var(--accent)] hover:brightness-110',
				/** The solid one beside the gradient: white on dark, ink on light. */
				contrast: 'rt-btn bg-contrast text-contrast-ink font-extrabold hover:brightness-95',
				secondary: 'bg-surface-hover text-text hover:bg-border-strong',
				outline:
					'border border-border-strong bg-transparent text-text hover:border-text-faint hover:bg-surface-hover',
				ghost: 'bg-transparent text-text-muted hover:bg-surface-hover hover:text-text',
				destructive: 'bg-danger text-white hover:opacity-90'
			},
			size: {
				sm: 'h-8 rounded-[9px] px-3 text-[13px]',
				default: 'h-10 rounded-[11px] px-4 text-sm',
				lg: 'h-[50px] px-[22px] text-[15.5px]',
				icon: 'size-9 rounded-[10px]'
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
