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

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-ink-800/70 bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <GhostMark className="h-7 w-7 text-spectral" />
            <span className="text-lg font-semibold tracking-tight text-white">Wraith</span>
            <Badge tone="accent" className="ml-1 hidden sm:inline-flex">
              Testnet
            </Badge>
          </div>
          <ConnectWallet />
        </div>

        <nav className="mx-auto max-w-5xl px-5 pb-3">
          <div className="inline-flex rounded-xl border border-ink-800 bg-ink-900/60 p-1">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  cx(
                    'rounded-lg px-4 py-1.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-spectral/15 text-white shadow-[inset_0_0_0_1px_rgba(124,108,255,0.4)]'
                      : 'text-zinc-400 hover:text-zinc-100',
                  )
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">{children}</main>

      <footer className="border-t border-ink-800/70">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-1 px-5 py-5 text-xs text-zinc-600 sm:flex-row sm:items-center">
          <span className="font-mono">Wraith · privacy platform on Stellar</span>
          <span className="font-mono">MOCK SDK · no real funds move · Testnet demo</span>
        </div>
      </footer>
    </div>
  )
}
