import { useMemo, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { deriveOwnerKey, fieldToHex } from '@wraith/sdk'
import { useWraith } from '../hooks/useWraith'
import { getSpendingKey } from '../lib/note-store'
import { ASSETS } from '../lib/assets'
import { formatUsd } from '../lib/format'
import { AssetAvatar, CopyIcon, GhostMark } from './ui'
import { ConnectWallet } from './ConnectWallet'
import { Sheet } from './Sheet'
import { Bridge } from './Bridge'
import { Pay } from './Pay'
import { Swap } from './Swap'

// --- action icons -----------------------------------------------------------

function PlusGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function SendGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M7 17 17 7m0 0H9m8 0v8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function SwapGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M7 5v14m0 0 3-3m-3 3-3-3M17 19V5m0 0 3 3m-3-3-3 3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ReceiveGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function EyeGlyph({ off, ...props }: SVGProps<SVGSVGElement> & { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
      {off && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
    </svg>
  )
}

// --- pieces -----------------------------------------------------------------

type SheetId = 'bridge' | 'send' | 'swap' | 'receive'

function ActionButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-2"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-ink-700 bg-ink-850 text-zinc-200 transition group-hover:border-spectral/50 group-hover:bg-spectral/10 group-hover:text-spectral-soft">
        {icon}
      </span>
      <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-200">{label}</span>
    </button>
  )
}

const HIDDEN = '••••••'

function Receive({ ownerKeyHex }: { ownerKeyHex: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(ownerKeyHex)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Share your <span className="text-zinc-200">shielded account key</span> to receive a private payment.
        It reveals nothing about your balance or history.
      </p>
      <div className="flex items-center justify-center rounded-2xl border border-ink-700 bg-ink-950/50 p-6">
        <GhostMark className="h-16 w-16 text-spectral/70" />
      </div>
      <button
        type="button"
        onClick={copy}
        className="flex w-full items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/70 px-3.5 py-3 text-left transition hover:border-spectral/40"
      >
        <span className="break-all font-mono text-xs text-zinc-300">{ownerKeyHex}</span>
        <CopyIcon className="ml-auto h-4 w-4 shrink-0 text-zinc-500" />
      </button>
      {copied && <p className="text-center text-xs text-emerald-400">Copied to clipboard</p>}
    </div>
  )
}

// --- wallet -----------------------------------------------------------------

export function Wallet() {
  const { balances, loadingBalances } = useWraith()
  const [revealed, setRevealed] = useState(false)
  const [sheet, setSheet] = useState<SheetId | null>(null)

  const total = balances.reduce((sum, b) => sum + b.usdEstimate, 0)

  const ownerKeyHex = useMemo(() => {
    try {
      return fieldToHex(deriveOwnerKey(getSpendingKey()))
    } catch (err) {
      console.error('owner key derivation failed', err)
      return '0x…'
    }
  }, [])

  const sheetMeta: Record<SheetId, { title: string; body: ReactNode }> = {
    bridge: { title: 'Deposit', body: <Bridge embedded /> },
    send: { title: 'Send', body: <Pay embedded /> },
    swap: { title: 'Swap', body: <Swap embedded /> },
    receive: { title: 'Receive', body: <Receive ownerKeyHex={ownerKeyHex} /> },
  }

  return (
    <div className="mx-auto w-full max-w-[460px] px-4 py-6">
      {/* Header — shielded identity */}
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/50 px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
          <span className="text-xs font-medium text-zinc-300">Stellar Testnet</span>
        </div>
        <ConnectWallet />
      </header>

      {/* Balance */}
      <section className="rounded-2xl border border-ink-700 bg-ink-850/70 p-6 text-center shadow-panel">
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs font-medium text-zinc-400">Shielded balance</span>
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Hide balance' : 'Reveal balance'}
            className="text-zinc-500 transition hover:text-spectral-soft"
          >
            <EyeGlyph off={!revealed} className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 font-mono text-4xl font-semibold tracking-tight text-zinc-100 tabular-nums">
          {loadingBalances ? '—' : revealed ? formatUsd(total) : HIDDEN}
        </div>
        <div className="mt-1 text-xs text-zinc-500">{revealed ? 'estimated value' : 'private by default'}</div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-center gap-5">
          <ActionButton label="Deposit" icon={<PlusGlyph className="h-5 w-5" />} onClick={() => setSheet('bridge')} />
          <ActionButton label="Send" icon={<SendGlyph className="h-5 w-5" />} onClick={() => setSheet('send')} />
          <ActionButton label="Swap" icon={<SwapGlyph className="h-5 w-5" />} onClick={() => setSheet('swap')} />
          <ActionButton label="Receive" icon={<ReceiveGlyph className="h-5 w-5" />} onClick={() => setSheet('receive')} />
        </div>
      </section>

      {/* Assets */}
      <section className="mt-6">
        <div className="mb-2 px-1 text-xs font-medium text-zinc-400">Assets</div>
        {loadingBalances ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/40 p-3">
                <div className="h-9 w-9 animate-pulse rounded-xl bg-ink-700" />
                <div className="h-3 w-16 animate-pulse rounded bg-ink-700" />
                <div className="ml-auto h-3 w-20 animate-pulse rounded bg-ink-700" />
              </div>
            ))}
          </div>
        ) : balances.length === 0 ? (
          <div className="rounded-2xl border border-ink-800 bg-ink-900/40 px-4 py-10 text-center text-sm text-zinc-500">
            No shielded balances yet.
            <button className="mt-3 block w-full text-spectral-soft hover:underline" onClick={() => setSheet('bridge')}>
              Deposit assets →
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {balances.map((b) => (
              <div
                key={b.asset}
                className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/40 p-3 transition hover:border-ink-700"
              >
                <AssetAvatar code={b.asset} className="h-9 w-9" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-tight text-zinc-100">{b.asset}</div>
                  <div className="truncate text-xs text-zinc-400">{ASSETS[b.asset].name}</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="font-mono text-sm tabular-nums text-zinc-100">{revealed ? b.amount : HIDDEN}</div>
                  <div className="text-xs text-zinc-400">{revealed ? `≈ ${formatUsd(b.usdEstimate)}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Action sheets */}
      {(['bridge', 'send', 'swap', 'receive'] as SheetId[]).map((id) => (
        <Sheet key={id} open={sheet === id} title={sheetMeta[id].title} onClose={() => setSheet(null)}>
          {sheet === id && sheetMeta[id].body}
        </Sheet>
      ))}
    </div>
  )
}
