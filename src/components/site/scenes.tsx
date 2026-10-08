import { cn } from '@/lib/cn'

// Drawn stand-ins for footage in the site's pictures of the app: a ridge at
// dawn, the sea at dusk, a city at night. Artwork, so its colours are its
// own and stay put in both themes. Each fills its box (preserveAspectRatio
// slice) and is decorative only.

type SceneProps = { className?: string; id: string }

/** Layered hills under a low sun: the "Weekend trip" footage. */
export function RidgeScene({ className, id }: SceneProps) {
	return (
		<svg
			aria-hidden
			viewBox="0 0 400 300"
			preserveAspectRatio="xMidYMid slice"
			className={cn('block size-full', className)}
		>
			<defs>
				<linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#2b3354" />
					<stop offset="0.55" stopColor="#8a86b0" />
					<stop offset="0.8" stopColor="#e7b9a6" />
				</linearGradient>
				<radialGradient id={`${id}-sun`} cx="0.62" cy="0.55" r="0.35">
					<stop offset="0" stopColor="#ffe2b8" stopOpacity="0.95" />
					<stop offset="0.25" stopColor="#ffc9a3" stopOpacity="0.55" />
					<stop offset="1" stopColor="#ffc9a3" stopOpacity="0" />
				</radialGradient>
			</defs>
			<rect width="400" height="300" fill={`url(#${id}-sky)`} />
			<rect width="400" height="300" fill={`url(#${id}-sun)`} />
			<circle cx="248" cy="168" r="14" fill="#ffd9a8" />
			<path
				d="M0 178 L40 160 L80 170 L130 140 L180 160 L230 150 L280 162 L330 146 L400 166 V300 H0Z"
				fill="#b9b3d6"
				opacity="0.8"
			/>
			<path
				d="M0 200 L60 176 L110 190 L160 168 L210 186 L260 172 L320 192 L400 178 V300 H0Z"
				fill="#8e88b4"
			/>
			<path
				d="M0 226 L50 204 L100 216 L150 196 L210 220 L270 200 L330 222 L400 206 V300 H0Z"
				fill="#5f5a86"
			/>
			<path
				d="M0 256 L70 230 L140 248 L200 232 L270 252 L340 236 L400 250 V300 H0Z"
				fill="#3b3760"
			/>
			<path d="M0 282 L80 262 L160 276 L240 260 L320 278 L400 266 V300 H0Z" fill="#262342" />
		</svg>
	)
}

/** A calm sea under a pale glow: the raw clip in Make it's before and after. */
export function SeaScene({ className, id }: SceneProps) {
	return (
		<svg
			aria-hidden
			viewBox="0 0 400 300"
			preserveAspectRatio="xMidYMid slice"
			className={cn('block size-full', className)}
		>
			<defs>
				<linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#2a2a2e" />
					<stop offset="0.6" stopColor="#6f6a66" />
				</linearGradient>
				<radialGradient id={`${id}-glow`} cx="0.85" cy="0.6" r="0.45">
					<stop offset="0" stopColor="#e6e3d6" stopOpacity="0.85" />
					<stop offset="1" stopColor="#e6e3d6" stopOpacity="0" />
				</radialGradient>
				<linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#3a3836" />
					<stop offset="1" stopColor="#121214" />
				</linearGradient>
			</defs>
			<rect width="400" height="300" fill={`url(#${id}-sky)`} />
			<rect width="400" height="300" fill={`url(#${id}-glow)`} />
			<rect y="178" width="400" height="122" fill={`url(#${id}-sea)`} />
			<g stroke="#d8d4c8" strokeLinecap="round" opacity="0.5">
				<path
					d="M250 196 H330 M220 214 H360 M270 232 H390 M200 252 H320 M300 270 H380"
					strokeWidth="2"
				/>
				<path d="M40 222 H90 M110 244 H170 M30 268 H120" strokeWidth="1.5" opacity="0.4" />
			</g>
		</svg>
	)
}

/** Lit windows against the dark: the last clip on the demo's timeline. */
export function CityScene({ className, id }: SceneProps) {
	const towers = [
		[0, 150, 40],
		[44, 120, 30],
		[78, 170, 36],
		[118, 100, 28],
		[150, 140, 44],
		[198, 110, 34],
		[236, 160, 40],
		[280, 125, 30],
		[314, 150, 42],
		[360, 115, 40]
	] as const
	return (
		<svg
			aria-hidden
			viewBox="0 0 400 300"
			preserveAspectRatio="xMidYMid slice"
			className={cn('block size-full', className)}
		>
			<defs>
				<linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#0d1026" />
					<stop offset="1" stopColor="#2a2550" />
				</linearGradient>
			</defs>
			<rect width="400" height="300" fill={`url(#${id}-sky)`} />
			{towers.map(([x, top, width]) => (
				<g key={x}>
					<rect x={x} y={top} width={width} height={300 - top} fill="#14142a" />
					{Array.from({ length: Math.floor((300 - top) / 18) }, (_, row) => (
						<rect
							key={row}
							x={x + 6}
							y={top + 8 + row * 18}
							width={width - 12}
							height="4"
							fill="#ffd27a"
							opacity={(x + row) % 3 === 0 ? 0.75 : 0.2}
						/>
					))}
				</g>
			))}
		</svg>
	)
}
