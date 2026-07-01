import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { cx } from '../lib/cx'
import { ConnectWallet } from './ConnectWallet'
import { Badge, GhostMark } from './ui'

const TABS = [
  { to: '/bridge', label: 'Bridge' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/pay', label: 'Pay' },
  { to: '/swap', label: 'Swap' },
]

const navPill = (isActive: boolean) =>
  cx(
    'rounded-full px-4 py-1.5 text-sm font-medium transition',
    isActive
      ? 'bg-spectral/15 text-zinc-100 shadow-[inset_0_0_0_1px_rgba(214,192,131,0.35)]'
      : 'text-zinc-400 hover:text-zinc-100',
  )

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-ink-800/80 bg-ink-950/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-2.5">
            <GhostMark className="h-7 w-7 text-spectral" />
            <span className="font-display text-lg font-semibold tracking-tight text-zinc-100">
              Wraith
            </span>
            <Badge tone="accent" className="ml-1 hidden sm:inline-flex">
              Testnet
            </Badge>
          </div>

          {/* Center nav (desktop) */}
          <nav className="hidden md:block">
            <div className="inline-flex rounded-full border border-ink-800 bg-ink-900/50 p-1">
              {TABS.map((tab) => (
                <NavLink key={tab.to} to={tab.to} className={({ isActive }) => navPill(isActive)}>
                  {tab.label}
                </NavLink>
              ))}
            </div>
          </nav>

          <ConnectWallet />
        </div>

        {/* Nav (mobile) */}
        <nav className="mx-auto max-w-5xl px-5 pb-3 md:hidden">
          <div className="flex rounded-full border border-ink-800 bg-ink-900/50 p-1">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) => cx('flex-1 text-center', navPill(isActive))}
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">{children}</main>

      <footer className="border-t border-ink-800/70">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-1.5 px-5 py-6 text-xs text-zinc-600 sm:flex-row sm:items-center">
          <span className="flex items-center gap-2 font-mono">
            <GhostMark className="h-4 w-4 text-zinc-600" />
            Wraith · private by proof
          </span>
          <span className="font-mono">Testnet · verified on Stellar</span>
        </div>
      </footer>
    </div>
  )
}
