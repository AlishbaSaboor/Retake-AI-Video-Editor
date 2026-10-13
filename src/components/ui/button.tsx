import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

// The design's two buttons: the accent one (what to press next) and the
// bordered "ghost" one beside it. 12px corners in the app; the site's pills
// pass `rounded-full`.
const buttonVariants = cva(
	'inline-flex shrink-0 items-center justify-center gap-2 rounded font-semibold whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				primary: 'rt-btn bg-accent text-accent-ink hover:bg-accent-hover',
				/** The solid one in the text colour: the quieter of two filled buttons. */
				contrast: 'rt-btn bg-contrast text-contrast-ink hover:opacity-90',
				secondary: 'bg-surface-hover text-text hover:bg-border',
				outline: 'border border-border-strong bg-transparent text-text hover:bg-border',
				ghost: 'bg-transparent text-text-muted hover:bg-border hover:text-text',
				destructive: 'bg-danger text-white hover:opacity-90'
			},
			size: {
				sm: 'h-[34px] px-3 text-[13.5px]',
				default: 'h-11 px-[18px] text-[15px]',
				lg: 'h-[52px] px-6 text-base',
				icon: 'size-[38px] rounded-[10px]'
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
