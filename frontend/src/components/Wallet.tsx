import { useState } from 'react'
import type { SVGProps } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useWraith } from '../hooks/useWraith'
import { clearAllNotes } from '../lib/note-store'
import { formatUsd } from '../lib/format'
import { USE_MOCK } from '../lib/config'
import { matchingEnabled } from '../lib/matcher-client'
import type { ShieldedBalance } from '../lib/wraith-sdk'
import { cx } from '../lib/cx'
import { CopyIcon, WraithMark } from './ui'
import { CoinBadge } from './BrandIcons'
import { ConnectWallet } from './ConnectWallet'
import { Bridge, type BridgeProgress } from './Bridge'
import { Pay } from './Pay'
import { Swap } from './Swap'
import { Act } from './Act'
import { ScrambleNumber } from './ScrambleNumber'
import { ProvenLedger } from './ProvenLedger'
import { BrandCanvas } from './BrandCanvas'

function EyeGlyph({ off, ...props }: SVGProps<SVGSVGElement> & { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
      {off && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
    </svg>
  )
}

const MASK = '######'

// --- top nav ----------------------------------------------------------------

const ACT_LINKS = [
  ['01 Cross', '/app/bridge'],
  ['02 Send', '/app/pay'],
  ['03 Book', '/app/swap'],
  ['04 Cipher', '/app/portfolio'],
] as const

function ActNav() {
  return (
    <header className="relative z-40 border-b border-[#efe9dc]/8 bg-[#1c1710]/40 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3">
        <NavLink to="/app/portfolio" className="flex items-center gap-2">
          <WraithMark className="h-5 w-5 text-spectral" />
          <span className="font-display text-sm font-semibold tracking-tight text-[#f6f1e6]">
            wraith <sup className="align-super font-mono text-[9px] tracking-[0.2em] text-spectral/60">ZK</sup>
          </span>
        </NavLink>
        <nav className="hidden items-center gap-6 font-mono text-[10px] uppercase tracking-[0.18em] text-spectral/70 sm:flex">
          {ACT_LINKS.map(([label, to]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cx('transition hover:text-[#f6f1e6]', isActive && 'text-[#f6f1e6]')}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <ConnectWallet />
      </div>
    </header>
  )
}

// --- masthead ---------------------------------------------------------------

function Masthead({
  balances,
  loading,
  revealed,
  onToggle,
}: {
  balances: ShieldedBalance[]
  loading: boolean
  revealed: boolean
  onToggle: () => void
}) {
  const total = balances.reduce((sum, b) => sum + b.usdEstimate, 0)
  const navigate = useNavigate()
  return (
    <section className="relative flex min-h-[88vh] flex-col items-center justify-center px-5 pb-16 pt-12 text-center">
      <div className="flex items-center gap-3">
        <span className="coord-label">shielded · [ poseidon · merkle ]</span>
        <button
          type="button"
          onClick={onToggle}
          aria-label={revealed ? 'Hide balance' : 'Reveal balance'}
          className="text-spectral/50 transition hover:text-spectral"
        >
          <EyeGlyph off={!revealed} className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-6 flex min-h-[4.5rem] items-center" style={{ textShadow: '0 2px 34px rgba(20,16,9,0.55)' }}>
        {loading ? (
          <span className="display-hd text-5xl text-spectral/25">••••••</span>
        ) : (
          <ScrambleNumber value={formatUsd(total)} revealed={revealed} className="display-hd text-[clamp(2.6rem,9vw,5rem)]" />
        )}
      </div>
      <div className="coord-label mt-3">{revealed ? 'your shielded total · usd' : 'private by default'}</div>

      {!loading && balances.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {balances.map((b) => (
            <span key={b.asset} className="flex items-center gap-2">
              <CoinBadge name={b.asset} size="sm" />
              <span className="font-mono text-sm text-zinc-200">{b.asset}</span>
              <span
                className={cx(
                  'font-mono text-sm tabular-nums',
                  revealed ? 'text-zinc-100' : 'wr-scramble-glyph wr-scramble-char',
                )}
              >
                {revealed ? b.amount : MASK}
              </span>
            </span>
          ))}
        </div>
      )}

      {!loading && balances.length === 0 && (
        <button
          type="button"
          onClick={() => navigate('/app/bridge')}
          className="coord-label mt-8 text-spectral/70 transition hover:text-spectral"
        >
          nothing shielded yet — cross the veil →
        </button>
      )}

      <div className="mt-10 w-full">
        <ProvenLedger />
      </div>

      <button type="button" onClick={() => navigate('/app/bridge')} className="coord-label mt-12 transition hover:text-spectral">
        cross the veil →
      </button>
    </section>
  )
}

// --- Act 01 crossing droplet ------------------------------------------------

function CrossingRule({ progress }: { progress: BridgeProgress }) {
  const frac = progress.total > 1 ? progress.step / (progress.total - 1) : 0
  const pct = progress.status === 'done' ? 100 : Math.round(frac * 100)
  const lit = progress.status === 'running' || progress.status === 'done'
  return (
    <div className="mb-6">
      <div className="coord-label mb-2 flex justify-between">
        <span>public world</span>
        <span>shielded pool</span>
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#efe9dc]/12" />
        <div
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-spectral/60 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute top-1/2 -translate-y-1/2 transition-all duration-700" style={{ left: `calc(${pct}% - 5px)` }}>
          <span
            className={cx(
              'block h-2.5 w-2.5 rounded-full transition-colors',
              lit ? 'bg-spectral shadow-[0_0_10px_2px_rgba(237,235,230,0.45)]' : 'bg-[#efe9dc]/40',
            )}
          />
        </div>
      </div>
    </div>
  )
}

// --- Act 03 honesty gate ----------------------------------------------------

function MatcherNote() {
  return (
    <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-300">
      <span className="font-mono uppercase tracking-[0.14em]">Operator</span> — orders place and cancel on-chain now; live
      matching connects when a matcher operator is running. Fills stay ZK-enforced at the midpoint, the operator only
      settles.
    </div>
  )
}

// --- Act 04 receive cipher --------------------------------------------------

function Receive({ receiveCode }: { receiveCode: string | null }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!receiveCode) return
    try {
      await navigator.clipboard.writeText(receiveCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center rounded-2xl border border-ink-700 bg-ink-900/40 p-8">
        <WraithMark className="h-20 w-20 text-spectral/70" />
      </div>
      {receiveCode ? (
        <>
          <button
            type="button"
            onClick={copy}
            className="flex w-full items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-4 text-left transition hover:border-spectral/40"
          >
            <span className="break-all font-mono text-sm text-zinc-200">{receiveCode}</span>
            <CopyIcon className="ml-auto h-4 w-4 shrink-0 text-zinc-500" />
          </button>
          {copied && <p className="text-center text-xs text-emerald-400">Copied to clipboard</p>}
        </>
      ) : (
        <p className="rounded-xl border border-ink-700 bg-ink-900/50 px-4 py-4 text-center text-sm text-zinc-500">
          Connect your Stellar wallet to reveal your receive code.
        </p>
      )}
    </div>
  )
}

// --- footer -----------------------------------------------------------------

function AppFooter({ onClearLocal }: { onClearLocal: () => void }) {
  return (
    <footer className="cream-panel">
      <div className="wr-grain absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto flex min-h-[68vh] w-full max-w-5xl flex-col justify-between px-8 py-16">
        <div className="flex items-start justify-between gap-6">
          <p className="max-w-xs text-[15px] font-medium leading-snug">
            Private money on Stellar. Bridge in, hold, pay and trade — proven on-chain, never revealed.
          </p>
          <WraithMark className="h-11 w-11" style={{ filter: 'brightness(0)' }} />
        </div>

        <div>
          <div
            className="font-display font-light uppercase leading-none tracking-[-0.02em] text-[#b3a081]"
            style={{ fontSize: 'clamp(2rem, 7vw, 5rem)' }}
          >
            enter the dark
          </div>
          <div className="mt-6 h-px w-full bg-[#1b1610]/20" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-[12px] uppercase tracking-[0.14em] text-[#1b1610]/70">
          <div className="flex flex-wrap gap-6">
            <a href="#/faucet" className="transition hover:text-[#1b1610]">
              Test token faucet
            </a>
            <button type="button" onClick={onClearLocal} className="uppercase transition hover:text-[#1b1610]">
              Clear local data
            </button>
          </div>
          <span>© Wraith 2026</span>
        </div>
      </div>
    </footer>
  )
}

// --- app shell + per-act routes ---------------------------------------------

export function AppShell() {
  const { refreshBalances } = useWraith()

  async function clearLocalData() {
    const ok = window.confirm(
      'Clear locally-cached shielded notes on this device?\n\nYour wallet stays connected — this only removes the notes/balance stored in this browser. Any on-chain funds tied to older notes stay on-chain.',
    )
    if (!ok) return
    clearAllNotes()
    await refreshBalances()
  }

  return (
    <div className="relative">
      <BrandCanvas />
      <ActNav />

      <Outlet />

      {/* Seam: the dark shielded film dissolves into the cream footer. Opaque
          ground→cream (a transparent lead-in of the SAME dark seats it on the
          fluid — never translucent cream over the field, which muds), and the
          footer's own grain runs over it so the junction has no bright band. */}
      <div aria-hidden className="pointer-events-none relative h-[46vh]">
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(28,23,16,0),#1c1710_22%,#f4efe4)]" />
        <div className="wr-grain absolute inset-0 opacity-40" />
      </div>
      <AppFooter onClearLocal={() => void clearLocalData()} />
    </div>
  )
}

export function PortfolioView() {
  const { balances, loadingBalances, receiveCode } = useWraith()
  const [revealed, setRevealed] = useState(false)
  return (
    <>
      <Masthead balances={balances} loading={loadingBalances} revealed={revealed} onToggle={() => setRevealed((v) => !v)} />

      <Act
        no="Act 04"
        id="act-cipher"
        title="Your cipher"
        standfirst="Your receive code. Share it to be paid privately; the sender encrypts to it, and it reveals nothing about your balance or history."
        coords={['Owner key', 'Enc pubkey']}
      >
        <Receive receiveCode={receiveCode} />
      </Act>
    </>
  )
}

export function BridgeView() {
  const [cross, setCross] = useState<BridgeProgress>({ step: 0, total: 2, status: 'idle' })
  return (
    <Act
      no="Act 01"
      id="act-cross"
      title="Cross the veil"
      standfirst="Move value across the veil between the public chains and the shielded pool. Every crossing is proven, not trusted — a real ZK proof out, or a light-client inclusion proof in."
      coords={['Stellar · SDF Horizon', 'Ethereum · Sepolia']}
    >
      <CrossingRule progress={cross} />
      <Bridge embedded onProgress={setCross} />
    </Act>
  )
}

export function PayView() {
  return (
    <Act
      no="Act 02"
      id="act-send"
      title="Send into the dark"
      standfirst="A 2-in / 2-out shielded transfer. Amounts and both parties stay hidden; on-chain, observers see only two opaque commitments and a valid proof."
      coords={['Poseidon · Merkle', '2-in · 2-out']}
    >
      <Pay embedded />
    </Act>
  )
}

export function SwapView() {
  return (
    <Act
      no="Act 03"
      id="act-book"
      title="The sealed book"
      standfirst="A dark pool where orders stay sealed until they match at the midpoint — so there is nothing to front-run."
      coords={['Sealed orders', 'Midpoint match']}
    >
      {!USE_MOCK && !matchingEnabled() && <MatcherNote />}
      <Swap embedded />
    </Act>
  )
}
