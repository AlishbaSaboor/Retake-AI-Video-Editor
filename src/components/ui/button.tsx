import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
				secondary: 'border border-border bg-surface-hover text-text hover:bg-border',
				outline: 'border border-border bg-transparent text-text hover:bg-surface-hover',
				ghost: 'bg-transparent text-text hover:bg-surface-hover',
				destructive: 'bg-danger text-white hover:opacity-90'
			},
			size: {
				sm: 'h-8 px-3 text-sm',
				default: 'h-9 px-4 text-sm',
				lg: 'h-10 px-6 text-base'
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
