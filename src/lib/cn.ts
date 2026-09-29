import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merge conditional classNames AND resolve conflicting Tailwind utilities
// (cn('p-2', condition && 'p-4') keeps only p-4, not both) — plain clsx
// alone would leave both classes in the string and let CSS source order
// decide, which silently breaks whichever one loses.
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
