import { Link } from 'react-router-dom'
import { useWraith } from '../hooks/useWraith'
import { ASSETS } from '../lib/assets'
import { formatUsd } from '../lib/format'
import type { ShieldedBalance } from '../lib/wraith-sdk'
import { AssetAvatar, Badge, Card, PageIntro } from './ui'

function BalanceCard({ balance }: { balance: ShieldedBalance }) {
  const meta = ASSETS[balance.asset]
  return (
    <Card className="flex items-center gap-4 p-5">
      <AssetAvatar code={balance.asset} />
      <div className="min-w-0">
        <div className="font-semibold tracking-tight text-white">{balance.asset}</div>
        <div className="truncate text-xs text-zinc-500">{meta.name}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="font-mono text-base tabular-nums text-zinc-100">{balance.amount}</div>
        <div className="text-xs text-zinc-500">≈ {formatUsd(balance.usdEstimate)}</div>
      </div>
    </Card>
  )
}

function BalanceSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[0, 1].map((i) => (
        <Card key={i} className="flex items-center gap-4 p-5">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-ink-700" />
          <div className="space-y-2">
            <div className="h-3.5 w-16 animate-pulse rounded bg-ink-700" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-ink-800" />
          </div>
          <div className="ml-auto h-4 w-20 animate-pulse rounded bg-ink-700" />
        </Card>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-800 text-zinc-600">
        <span className="text-xl">∅</span>
      </div>
      <div>
        <p className="font-medium text-zinc-200">No shielded balances yet</p>
        <p className="mt-1 text-sm text-zinc-500">Bridge XLM or USDC into Wraith to get started.</p>
      </div>
      <Link to="/bridge" className="btn btn-primary btn-sm mt-1">
        Go to Bridge
      </Link>
    </Card>
  )
}

export function Portfolio() {
  const { balances, loadingBalances } = useWraith()
  const total = balances.reduce((sum, b) => sum + b.usdEstimate, 0)

  return (
    <div className="space-y-6">
      <PageIntro title="Portfolio" subtitle="Your shielded, multi-asset balances — visible only to you." />

      <Card className="flex items-end justify-between p-6">
        <div>
          <div className="label">Total shielded value</div>
          <div className="font-mono text-3xl font-semibold tracking-tight text-white">
            {loadingBalances ? '—' : formatUsd(total)}
          </div>
        </div>
        <Badge tone="accent">Estimate</Badge>
      </Card>

      {loadingBalances ? (
        <BalanceSkeleton />
      ) : balances.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {balances.map((balance) => (
            <BalanceCard key={balance.asset} balance={balance} />
          ))}
        </div>
      )}
    </div>
  )
}
