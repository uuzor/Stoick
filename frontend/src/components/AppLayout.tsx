import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useWraith } from '../hooks/useWraith'
import { clearAllNotes } from '../lib/note-store'
import { formatUsd } from '../lib/format'
import { cx } from '../lib/cx'
import { BrandCanvas } from './BrandCanvas'
import { ConnectWallet } from './ConnectWallet'
import { EyeGlyph, WraithMark } from './ui'
import { ScrambleNumber } from './ScrambleNumber'

const NAV = [
  ['Bridge', '/bridge'],
  ['Pay', '/pay'],
  ['Swap', '/swap'],
  ['Receive', '/receive'],
] as const

function ShieldedChip() {
  const { balances, loadingBalances } = useWraith()
  const [revealed, setRevealed] = useState(false)
  if (loadingBalances || balances.length === 0) return null
  const total = balances.reduce((sum, b) => sum + b.usdEstimate, 0)
  return (
    <div className="hidden items-center gap-2 md:flex">
      <span className="coord-label">shielded</span>
      <ScrambleNumber value={formatUsd(total)} revealed={revealed} className="font-mono text-sm text-[#f6f1e6]" />
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-label={revealed ? 'Hide balance' : 'Reveal balance'}
        className="text-spectral/50 transition hover:text-spectral"
      >
        <EyeGlyph off={!revealed} className="h-4 w-4" />
      </button>
    </div>
  )
}

function AppNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#efe9dc]/8 bg-[#1c1710]/40 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <NavLink to="/app" className="flex items-center gap-2">
          <WraithMark className="h-5 w-5 text-spectral" />
          <span className="font-display text-sm font-semibold tracking-tight text-[#f6f1e6]">
            wraith <sup className="align-super font-mono text-[9px] tracking-[0.2em] text-spectral/60">ZK</sup>
          </span>
        </NavLink>
        <nav className="hidden items-center gap-6 font-mono text-[10px] uppercase tracking-[0.18em] sm:flex">
          {NAV.map(([label, to]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cx('transition hover:text-[#f6f1e6]', isActive ? 'text-[#f6f1e6]' : 'text-spectral/70')
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <ShieldedChip />
          <ConnectWallet />
        </div>
      </div>
    </header>
  )
}

function AppFooter() {
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
    <footer className="cream-panel relative mt-auto">
      <div className="wr-grain absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <WraithMark className="h-8 w-8" style={{ filter: 'brightness(0)' }} />
          <p className="max-w-xs text-[13px] font-medium leading-snug">
            Private money on Stellar. Bridge in, hold, pay and trade — proven on-chain, never revealed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[#1b1610]/70">
          <NavLink to="/faucet" className="transition hover:text-[#1b1610]">
            Test token faucet
          </NavLink>
          <button type="button" onClick={() => void clearLocalData()} className="uppercase transition hover:text-[#1b1610]">
            Clear local data
          </button>
          <span>© Wraith 2026</span>
        </div>
      </div>
    </footer>
  )
}

/** Persistent app shell: the BrandCanvas world, router nav and cream footer wrap
 *  every routed surface (hub, bridge, pay, swap, receive, faucet). */
export function AppLayout() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <BrandCanvas />
      <AppNav />
      <main className="relative flex-1">
        <Outlet />
      </main>
      <div aria-hidden className="pointer-events-none relative h-[20vh]">
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(28,23,16,0),#1c1710_28%,#f4efe4)]" />
        <div className="wr-grain absolute inset-0 opacity-40" />
      </div>
      <AppFooter />
    </div>
  )
}

export default AppLayout
