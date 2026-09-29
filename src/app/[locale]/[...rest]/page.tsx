import { notFound } from 'next/navigation'

// Next can't resolve into [locale] for a path with no matching page at
// all — without something here to match, an unmatched URL falls back to
// Next's own built-in 404 instead of [locale]/not-found.tsx, since the
// router never enters this segment's tree to find it. This file exists
// purely to give it something to match, then hands off to notFound()
// immediately.
export default function CatchAll() {
	notFound()
}
