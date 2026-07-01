import type { FC, SVGProps } from 'react'
import { cx } from '../lib/cx'

/**
 * Monochrome brand marks for chains and tokens.
 *
 * Rendered as single-color glyphs (they inherit `currentColor`) so they sit cleanly
 * in the black-and-white UI — no external image fetches, so nothing can 404. The
 * Stellar and Ethereum paths are the canonical simple-icons marks; USDC and the
 * Wraith ghost are drawn to match the same weight.
 */

export function StellarGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12.003 1.716c-1.37 0-2.7.27-3.948.78A10.18 10.18 0 0 0 2.66 7.901a10.136 10.136 0 0 0-.797 3.954c0 .258.01.516.027.775a1.942 1.942 0 0 1-1.055 1.88L0 14.934v1.902l2.463-1.26.072-.032v.005l.77-.39.758-.385.066-.039 14.807-7.56 1.666-.847 3.392-1.732V2.694L17.792 5.86 3.744 13.025l-.104.055-.017-.115a8.286 8.286 0 0 1-.071-1.105c0-2.255.88-4.377 2.474-5.977a8.462 8.462 0 0 1 2.71-1.82 8.513 8.513 0 0 1 3.2-.654h.067a8.41 8.41 0 0 1 4.09 1.055l1.628-.83.126-.066a10.11 10.11 0 0 0-5.845-1.853zM24 7.143 5.047 16.808l-1.666.847L0 19.382v1.902l3.282-1.671 2.91-1.485 14.058-7.153.105-.055.016.115c.05.369.072.743.072 1.11 0 2.255-.88 4.383-2.475 5.978a8.461 8.461 0 0 1-2.71 1.82 8.305 8.305 0 0 1-3.2.654h-.06c-1.441 0-2.86-.369-4.102-1.061l-.066.033-1.683.857c.594.418 1.232.776 1.903 1.062a10.11 10.11 0 0 0 3.947.797 10.09 10.09 0 0 0 7.17-2.975 10.136 10.136 0 0 0 2.969-7.18c0-.259-.005-.523-.027-.781a1.942 1.942 0 0 1 1.055-1.88L24 9.044z" />
    </svg>
  )
}

export function EthereumGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" />
    </svg>
  )
}

export function UsdcGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...props}>
      <circle cx="12" cy="12" r="9.25" />
      <path d="M12 6.3v11.4" strokeLinecap="round" />
      <path
        d="M14.8 9c-.52-.92-1.57-1.45-2.8-1.45-1.65 0-2.85.83-2.85 2.15 0 1.3 1.05 1.83 2.85 2.25 1.8.42 3 .95 3 2.35 0 1.35-1.2 2.2-2.95 2.2-1.35 0-2.5-.53-3.02-1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function GhostMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden {...props}>
      <path
        d="M16 4c-5 0-9 4-9 9v13l3-2.2 3 2.2 3-2.2 3 2.2 3-2.2 3 2.2V13c0-5-4-9-9-9z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M16 4c-5 0-9 4-9 9v13l3-2.2 3 2.2 3-2.2 3 2.2 3-2.2 3 2.2V13c0-5-4-9-9-9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12.5" cy="13.5" r="1.4" fill="currentColor" />
      <circle cx="19.5" cy="13.5" r="1.4" fill="currentColor" />
    </svg>
  )
}

// --- Coin badge -------------------------------------------------------------

type GlyphComponent = FC<SVGProps<SVGSVGElement>>

/** Registry keyed by both chain ids and token codes. */
const GLYPHS: Record<string, GlyphComponent> = {
  stellar: StellarGlyph,
  ethereum: EthereumGlyph,
  wraith: GhostMark,
  XLM: StellarGlyph,
  ETH: EthereumGlyph,
  bETH: EthereumGlyph,
  USDC: UsdcGlyph,
  bUSDC: UsdcGlyph,
}

const SIZES = {
  sm: { chip: 'h-5 w-5', glyph: 'h-3 w-3' },
  md: { chip: 'h-7 w-7', glyph: 'h-4 w-4' },
  lg: { chip: 'h-9 w-9', glyph: 'h-[18px] w-[18px]' },
} as const

/**
 * A chain or token logo inside a round monochrome chip. `name` is a chain id
 * (`stellar`/`ethereum`/`wraith`) or a token code (`XLM`, `ETH`, `bETH`, …).
 * Unknown names fall back to a short mono label so nothing renders empty.
 */
export function CoinBadge({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const Glyph = GLYPHS[name]
  const s = SIZES[size]
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-ink-700 bg-ink-800 text-zinc-100',
        s.chip,
        className,
      )}
    >
      {Glyph ? (
        <Glyph className={s.glyph} />
      ) : (
        <span className="font-mono text-[8px] font-bold leading-none">{name.replace(/^b/, '').slice(0, 3)}</span>
      )}
    </span>
  )
}
