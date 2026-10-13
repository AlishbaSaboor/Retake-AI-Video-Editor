import { ClosingBand } from '@/components/site/closing-band'
import { LandingMotion } from '@/components/site/landing/landing-motion'
import {
	Hero,
	MakeScene,
	Promises,
	Questions,
	StoryScene,
	Timecode,
	ToolTrack,
	WordRiver
} from '@/components/site/landing/landing-scenes'

/**
 * The landing page, as the owner's design lays it out: one sentence edited
 * live, then three pinned scenes driven by scroll (the five fixes, Make it
 * step by step, every tool on a sideways track), the promises, the first
 * questions and the way in, over a slow river of spoken words.
 */
export default function LandingPage() {
	return (
		<>
			<WordRiver />
			<Timecode />
			<main className="relative z-[1]">
				<Hero />
				<StoryScene />
				<MakeScene />
				<ToolTrack />
				<Promises />
				<Questions />
				<ClosingBand />
			</main>
			<LandingMotion />
		</>
	)
}
