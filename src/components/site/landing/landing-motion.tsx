'use client'

import { useEffect } from 'react'

// The landing page's motion (design notes: motion spec). One scroll
// listener, batched into requestAnimationFrame, works out each pinned
// scene's progress and moves what renders on the server: it sets the story
// stage's --s1 to --s5, switches the Make it panes and types the request,
// slides the tool track, lights the hero sentence and runs the corner
// timecode. The word rows drift on their own frame loop. Only transform,
// opacity, CSS variables and data attributes change. With reduced motion
// nothing loops: the CSS lays the scenes out plainly, and the hero sentence
// is shown fixed.

const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))

/** How far through `el` the page has scrolled, 0 to 1, while it's pinned. */
function progress(el: HTMLElement): number {
	const box = el.getBoundingClientRect()
	const room = box.height - innerHeight
	return room > 0 ? clamp(-box.top / room, 0, 1) : 0
}

const toggle = (el: Element, name: string, on: boolean) => el.toggleAttribute(name, on)

/** The hero sentence at `p` (0 to 1): the um marked, cut, then the words played one by one. */
function sayAt(hero: HTMLElement, p: number) {
	const words = [...hero.querySelectorAll<HTMLElement>('[data-word]')]
	const filler = hero.querySelector<HTMLElement>('[data-filler]')
	const note = hero.querySelector<HTMLElement>('[data-say-note]')
	const tc = hero.querySelector<HTMLElement>('[data-say-tc]')
	if (!filler || !note || !tc) return
	const mark = p >= 0.1
	const gone = p >= 0.42
	const state = gone ? 'gone' : mark ? 'mark' : ''
	filler.dataset.state = state
	note.dataset.state = state
	const lit = gone ? Math.floor(clamp((p - 0.48) / 0.45, 0, 1) * (words.length + 0.99)) : 0
	words.forEach((word, i) => toggle(word, 'data-on', i < lit))
	note.textContent =
		(!mark
			? note.dataset.scroll
			: !gone
				? note.dataset.marked
				: lit < words.length
					? note.dataset.cut
					: note.dataset.playing) ?? ''
	tc.textContent = `0:${String(18 + Math.min(4, Math.floor(lit / 2))).padStart(2, '0')}`
}

const PANES = ['type', 'ask', 'read', 'plan', 'done'] as const

/** Starts the page's motion; returns what stops it. Plain DOM work, outside React's render. */
function startLandingMotion(): () => void {
	{
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
		const $ = <T extends Element = HTMLElement>(selector: string) =>
			document.querySelector<T>(selector)
		const hero = $('[data-hero]')
		const story = $('[data-scene="story"]')
		const stage = $('[data-stage]')
		const steps = $('[data-steps]')
		const stepItems = [...document.querySelectorAll<HTMLElement>('[data-step]')]
		const make = $('[data-scene="make"]')
		const editor = $('[data-scene="editor"]')
		const track = $('[data-track]')
		const timecode = $('[data-timecode]')
		if (!hero || !story || !stage || !steps || !make || !editor || !track) return () => {}

		const panes = PANES.map((name) => make.querySelector<HTMLElement>(`[data-pane="${name}"]`))
		const makeSteps = [...make.querySelectorAll<HTMLElement>('[data-make-step]')]
		const typed = make.querySelector<HTMLElement>('[data-typed]')
		const lengths = [...make.querySelectorAll('[data-len]')]
		const looks = [...make.querySelectorAll('[data-look]')]
		const tone = make.querySelector<HTMLElement>('[data-tone]')
		const readBars = [...make.querySelectorAll('[data-read-bar]')]
		const readLines = [...make.querySelectorAll('[data-read-line]')]
		const planRows = [...make.querySelectorAll('[data-plan-row]')]
		const checked = make.querySelector('[data-checked]')
		const apply = make.querySelector('[data-apply]')
		const reelVideo = make.querySelector<HTMLVideoElement>('[data-reel-video]')
		const reelWord = make.querySelector<HTMLElement>('[data-reel-word]')
		const request = typed?.dataset.text ?? ''

		function doStory(p: number) {
			const seg = p * 5
			for (let i = 0; i < 5; i++)
				stage?.style.setProperty(`--s${i + 1}`, clamp(seg - i, 0, 1).toFixed(3))
			const active = Math.min(4, Math.floor(seg))
			stepItems.forEach((li, i) => {
				li.dataset.state = i === active ? 'on' : i < active ? 'done' : ''
			})
			steps?.style.setProperty('--p', p.toFixed(3))
			stage?.style.setProperty('--p', p.toFixed(3))
		}

		let shown = ''
		function doMake(p: number) {
			const pane =
				p < 0.14 ? 'type' : p < 0.36 ? 'ask' : p < 0.5 ? 'read' : p < 0.87 ? 'plan' : 'done'
			if (pane !== shown) {
				const index = PANES.indexOf(pane)
				panes.forEach((el, i) => el && toggle(el, 'data-show', i === index))
				makeSteps.forEach((el, i) => {
					el.dataset.state = i === index ? 'on' : i < index ? 'done' : ''
				})
				if (reelVideo) {
					if (pane === 'done') reelVideo.play().catch(() => {})
					else reelVideo.pause()
				}
				shown = pane
			}
			if (typed)
				typed.textContent = request.slice(0, Math.round(request.length * clamp(p / 0.11, 0, 1)))
			lengths.forEach((el, i) => toggle(el, 'data-sel', i === 1 && p > 0.2))
			looks.forEach((el, i) => toggle(el, 'data-sel', i === 4 && p > 0.25))
			if (tone) {
				const value = tone.dataset.value ?? ''
				const n = Math.round(value.length * clamp((p - 0.27) / 0.05, 0, 1))
				tone.textContent = n ? value.slice(0, n) : (tone.dataset.placeholder ?? '')
				toggle(tone, 'data-val', n > 0)
			}
			const read = clamp((p - 0.37) / 0.12, 0, 1)
			readBars.forEach((el, i) => toggle(el, 'data-on', i / readBars.length < read))
			readLines.forEach((el, i) =>
				toggle(el, 'data-on', read > (i + 0.5) / (readLines.length + 0.5))
			)
			const rows = Math.floor((p - 0.52) / 0.035) + 1
			planRows.forEach((el, i) => toggle(el, 'data-on', i < rows))
			if (checked) toggle(checked, 'data-on', p > 0.82)
			if (apply) toggle(apply, 'data-press', p > 0.855 && p < 0.87)
		}

		function doEditor(p: number) {
			if (!track) return
			const room = track.scrollWidth - track.clientWidth + 48
			track.style.transform = `translate3d(${(-p * Math.max(0, room)).toFixed(1)}px,0,0)`
		}

		function frame() {
			if (!hero) return
			if (!reduced && story && make && editor) {
				doStory(progress(story))
				doMake(progress(make))
				doEditor(progress(editor))
			}
			sayAt(hero, reduced ? 1 : clamp(scrollY / Math.max(1, hero.offsetHeight * 0.55), 0, 1))
			if (timecode) {
				const doc = clamp(
					scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight),
					0,
					1
				)
				const frames = Math.round(doc * 168 * 24)
				const seconds = Math.floor(frames / 24)
				timecode.textContent = [Math.floor(seconds / 60), seconds % 60, frames % 24]
					.map((n) => String(n).padStart(2, '0'))
					.join(':')
			}
		}

		let ticking = false
		const onScroll = () => {
			if (ticking) return
			ticking = true
			requestAnimationFrame(() => {
				ticking = false
				frame()
			})
		}
		addEventListener('scroll', onScroll, { passive: true })
		addEventListener('resize', onScroll)
		frame()

		// The word rows: each drifts sideways, alternate rows the other way, a
		// little faster as you scroll; now and then a filler in them is cut.
		const rows = [...document.querySelectorAll<HTMLElement>('[data-row]')].map((el, i) => ({
			el,
			speed: (i % 2 ? -1 : 1) * (14 + i * 3),
			scroll: (i % 2 ? 1 : -1) * (0.25 + i * 0.05),
			width: 0
		}))
		const measure = () => {
			for (const row of rows) row.width = row.el.scrollWidth / 4
		}
		measure()
		document.fonts?.ready.then(measure).catch(() => {})
		addEventListener('resize', measure)
		const cuts = [...document.querySelectorAll<HTMLElement>('[data-river] i')]
		const timers: number[] = []
		const cutter = reduced
			? 0
			: window.setInterval(() => {
					const el = cuts[Math.floor(Math.random() * cuts.length)]
					if (!el) return
					el.toggleAttribute('data-gone', true)
					timers.push(window.setTimeout(() => el.toggleAttribute('data-gone', false), 4200))
				}, 700)
		let words = 0
		const reelWords = (reelWord?.dataset.words ?? '').split(' ').filter(Boolean)
		const reelTimer =
			reduced || !reelWord || reelWords.length === 0
				? 0
				: window.setInterval(() => {
						reelWord.textContent = reelWords[words++ % reelWords.length] ?? ''
					}, 520)
		const start = performance.now()
		let loop = 0
		const drift = (now: number) => {
			const t = (now - start) / 1000
			for (const row of rows) {
				if (!row.width) continue
				let x = ((reduced ? 0 : t * row.speed) + scrollY * row.scroll) % row.width
				if (x > 0) x -= row.width
				row.el.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`
			}
			if (!reduced) loop = requestAnimationFrame(drift)
		}
		loop = requestAnimationFrame(drift)
		const onReducedScroll = () => requestAnimationFrame(drift)
		if (reduced) addEventListener('scroll', onReducedScroll, { passive: true })

		return () => {
			removeEventListener('scroll', onScroll)
			removeEventListener('resize', onScroll)
			removeEventListener('resize', measure)
			removeEventListener('scroll', onReducedScroll)
			cancelAnimationFrame(loop)
			clearInterval(cutter)
			clearInterval(reelTimer)
			timers.forEach((id) => clearTimeout(id))
		}
	}
}

export function LandingMotion() {
	useEffect(() => startLandingMotion(), [])
	return null
}
