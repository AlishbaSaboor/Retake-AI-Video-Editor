'use client'

import { useEffect, useRef } from 'react'
import { trackElementViewed } from '@/lib/analytics/track'
import type { ElementType } from '@/lib/analytics/events'

// Fires element_viewed once, the first time its children scroll into view —
// the top-of-funnel impression that pairs with element_clicked. Wrap a section,
// card, or CTA you want impression data on:
//
//   <TrackImpression elementType="section" elementName="pricing_table">
//     <PricingTable />
//   </TrackImpression>
//
// Renders a plain wrapper <div>; pass className to control layout. Uses one
// IntersectionObserver and disconnects after the first hit, so it costs nothing
// after the impression fires.
export function TrackImpression({
	elementType,
	elementName,
	threshold = 0.5,
	className,
	children
}: {
	elementType: ElementType
	elementName: string
	threshold?: number
	className?: string
	children: React.ReactNode
}) {
	const ref = useRef<HTMLDivElement>(null)
	const fired = useRef(false)

	useEffect(() => {
		const node = ref.current
		if (node == null || fired.current) return
		if (typeof IntersectionObserver === 'undefined') return

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && !fired.current) {
						fired.current = true
						trackElementViewed({ element_type: elementType, element_name: elementName })
						observer.disconnect()
					}
				}
			},
			{ threshold }
		)
		observer.observe(node)
		return () => observer.disconnect()
	}, [elementType, elementName, threshold])

	return (
		<div ref={ref} className={className}>
			{children}
		</div>
	)
}
