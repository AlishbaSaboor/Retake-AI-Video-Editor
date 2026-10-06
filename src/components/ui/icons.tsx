// The only file in this project allowed to import an icon library.
// `no-restricted-imports` in eslint.config.mjs enforces that — everything
// else imports from '@/components/ui/icons'. See docs/rules/icons.md for
// the why; this file is the how.
//
// Swapping provider (phosphor -> lucide, heroicons, tabler, ...) is three
// edits, all inside this file:
//   1. the import below,
//   2. `Glyph`'s body, so the provider's own prop names get the same
//      IconProps shape mapped onto them,
//   3. the export list, mapping each name to the new provider's equivalent.
// Nothing outside this file changes — that's the entire point of it.
//
// Imported from phosphor's `/ssr` entry, not its root, deliberately: the
// root entry's icons read their defaults from a React context, which makes
// them Client Components, and the package ships no 'use client' directive
// to say so — a Server Component rendering one fails at request time. The
// `/ssr` build takes its props directly and renders in both. Keep this
// import path if you stay on phosphor.
import {
	ArrowCounterClockwise,
	ArrowLeft,
	ClosedCaptioning,
	Crop,
	Cursor,
	Drop,
	Gauge,
	MusicNotes,
	PencilLine,
	Timer,
	ArrowRight,
	ArrowsClockwise,
	ArrowsInLineHorizontal,
	ArrowUUpLeft,
	ArrowUUpRight,
	Article,
	Broom,
	CaretDown,
	ChatCircleDots,
	Check,
	CheckCircle,
	CircleNotch,
	CloudArrowUp,
	Copy,
	DownloadSimple,
	FilmStrip,
	FloppyDisk,
	FolderOpen,
	House,
	Image,
	Info,
	Intersect,
	Lightning,
	List,
	MagnifyingGlass,
	Microphone,
	Moon,
	Paperclip,
	PaperPlaneRight,
	Pause,
	PencilSimple,
	Play,
	Plus,
	Scissors,
	SidebarSimple,
	SignIn,
	SignOut,
	SlidersHorizontal,
	Sparkle,
	SpeakerHigh,
	SpeakerLow,
	Star,
	Stop,
	Sun,
	TextT,
	Trash,
	Warning,
	Waveform,
	WaveSquare,
	X
} from '@phosphor-icons/react/ssr'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

// Deliberately narrower than the provider's own props: a call site can set
// size and classes, and nothing else. Provider-specific props (phosphor's
// `weight` and `mirrored`, lucide's `strokeWidth`) stay out so a swap can't
// break call sites — set those once in `Glyph` below if this project wants
// a different house style.
export type IconProps = {
	// Pixels. 16 pairs with `text-sm`; bump per call site, don't change the
	// default without checking the components that rely on it.
	size?: number
	className?: string
}

const DEFAULT_SIZE = 16

function Glyph({ source: Source, size = DEFAULT_SIZE, className }: IconProps & { source: Icon }) {
	return (
		<Source
			size={size}
			className={className}
			// Every icon here is decorative — it sits next to a text label, or
			// inside a control that carries its own aria-label. Hiding it stops
			// a screen reader announcing the same thing twice. An icon-only
			// button labels the *button*, never the glyph (see DESIGN.md's
			// accessibility baseline), so there is no per-icon label prop.
			aria-hidden
			// Icons inherit the text color of whatever they sit in — that's why
			// no color token appears anywhere in this file.
			color="currentColor"
			// The house stroke weight, in one place. 'regular' is phosphor's own
			// default; change it here to restyle every icon at once.
			weight="regular"
		/>
	)
}

// One line per icon, named for its role where the project has one
// (SpinnerIcon, not CircleNotchIcon) — a rename here should never cascade
// through call sites, same rule as the design tokens in DESIGN.md. It also
// means the next provider's spelling (phosphor's CaretDown vs. lucide's
// ChevronDown) stays behind this file.
//
// Add an icon when a component actually needs it; don't mirror the
// provider's whole catalog here. Keep the list alphabetical.
export const AiIcon = (props: IconProps) => <Glyph source={Lightning} {...props} />
export const AlertIcon = (props: IconProps) => <Glyph source={Warning} {...props} />
export const ArrowLeftIcon = (props: IconProps) => <Glyph source={ArrowLeft} {...props} />
export const CaptionsIcon = (props: IconProps) => <Glyph source={ClosedCaptioning} {...props} />
export const CropIcon = (props: IconProps) => <Glyph source={Crop} {...props} />
export const SelectIcon = (props: IconProps) => <Glyph source={Cursor} {...props} />
export const ColourIcon = (props: IconProps) => <Glyph source={Drop} {...props} />
export const SpeedIcon = (props: IconProps) => <Glyph source={Gauge} {...props} />
export const MusicIcon = (props: IconProps) => <Glyph source={MusicNotes} {...props} />
export const DrawIcon = (props: IconProps) => <Glyph source={PencilLine} {...props} />
export const TimingIcon = (props: IconProps) => <Glyph source={Timer} {...props} />
export const ArrowRightIcon = (props: IconProps) => <Glyph source={ArrowRight} {...props} />
export const ArticleIcon = (props: IconProps) => <Glyph source={Article} {...props} />
export const AttachIcon = (props: IconProps) => <Glyph source={Paperclip} {...props} />
export const CheckIcon = (props: IconProps) => <Glyph source={Check} {...props} />
export const ChevronDownIcon = (props: IconProps) => <Glyph source={CaretDown} {...props} />
export const CleanupIcon = (props: IconProps) => <Glyph source={Broom} {...props} />
export const ClippingIcon = (props: IconProps) => <Glyph source={WaveSquare} {...props} />
export const CloseIcon = (props: IconProps) => <Glyph source={X} {...props} />
export const CopyIcon = (props: IconProps) => <Glyph source={Copy} {...props} />
export const DarkModeIcon = (props: IconProps) => <Glyph source={Moon} {...props} />
export const DownloadIcon = (props: IconProps) => <Glyph source={DownloadSimple} {...props} />
export const EditIcon = (props: IconProps) => <Glyph source={PencilSimple} {...props} />
export const FillerWordIcon = (props: IconProps) => <Glyph source={ChatCircleDots} {...props} />
export const HighlightIcon = (props: IconProps) => <Glyph source={Star} {...props} />
export const HomeIcon = (props: IconProps) => <Glyph source={House} {...props} />
export const ImageIcon = (props: IconProps) => <Glyph source={Image} {...props} />
export const InfoIcon = (props: IconProps) => <Glyph source={Info} {...props} />
export const LightModeIcon = (props: IconProps) => <Glyph source={Sun} {...props} />
export const ManualIcon = (props: IconProps) => <Glyph source={SlidersHorizontal} {...props} />
export const MenuIcon = (props: IconProps) => <Glyph source={List} {...props} />
export const MergeIcon = (props: IconProps) => <Glyph source={ArrowsInLineHorizontal} {...props} />
export const MicIcon = (props: IconProps) => <Glyph source={Microphone} {...props} />
export const NoiseIcon = (props: IconProps) => <Glyph source={Waveform} {...props} />
export const PanelIcon = (props: IconProps) => <Glyph source={SidebarSimple} {...props} />
export const PauseIcon = (props: IconProps) => <Glyph source={Pause} {...props} />
export const PlayIcon = (props: IconProps) => <Glyph source={Play} {...props} />
export const PlusIcon = (props: IconProps) => <Glyph source={Plus} {...props} />
export const ProjectsIcon = (props: IconProps) => <Glyph source={FolderOpen} {...props} />
export const QuietIcon = (props: IconProps) => <Glyph source={SpeakerLow} {...props} />
export const RedoIcon = (props: IconProps) => <Glyph source={ArrowUUpRight} {...props} />
export const ReplaceIcon = (props: IconProps) => <Glyph source={ArrowsClockwise} {...props} />
export const ResetIcon = (props: IconProps) => <Glyph source={ArrowCounterClockwise} {...props} />
export const SaveIcon = (props: IconProps) => <Glyph source={FloppyDisk} {...props} />
export const SearchIcon = (props: IconProps) => <Glyph source={MagnifyingGlass} {...props} />
export const SendIcon = (props: IconProps) => <Glyph source={PaperPlaneRight} {...props} />
export const SignInIcon = (props: IconProps) => <Glyph source={SignIn} {...props} />
export const SignOutIcon = (props: IconProps) => <Glyph source={SignOut} {...props} />
export const SoundIcon = (props: IconProps) => <Glyph source={SpeakerHigh} {...props} />
export const SparkleIcon = (props: IconProps) => <Glyph source={Sparkle} {...props} />
export const SplitIcon = (props: IconProps) => <Glyph source={Scissors} {...props} />
export const StopIcon = (props: IconProps) => <Glyph source={Stop} {...props} />
export const SuccessIcon = (props: IconProps) => <Glyph source={CheckCircle} {...props} />
export const TextIcon = (props: IconProps) => <Glyph source={TextT} {...props} />
export const TransitionIcon = (props: IconProps) => <Glyph source={Intersect} {...props} />
export const TrashIcon = (props: IconProps) => <Glyph source={Trash} {...props} />
export const UndoIcon = (props: IconProps) => <Glyph source={ArrowUUpLeft} {...props} />
export const UploadIcon = (props: IconProps) => <Glyph source={CloudArrowUp} {...props} />
export const VideoIcon = (props: IconProps) => <Glyph source={FilmStrip} {...props} />

// The spinner is the one icon that carries its own behaviour — every call
// site was animating it by hand, so it does it here instead. `motion-reduce`
// honours prefers-reduced-motion (DESIGN.md).
export const SpinnerIcon = ({ className, ...props }: IconProps) => (
	<Glyph
		source={CircleNotch}
		className={cn('animate-spin motion-reduce:animate-none', className)}
		{...props}
	/>
)
