import { useState } from 'react'
import { useWraith } from '../hooks/useWraith'
import { useProofFlow } from '../hooks/useProofFlow'
import { formatAmount, parseAmount } from '../lib/format'
import type { OpenOrder, OrderSide } from '../lib/wraith-sdk'
import { TOKEN_OPTIONS } from '../lib/tokens'
import {
  Badge,
  Button,
  Card,
  ChartIcon,
  Field,
  PageIntro,
  SectionHeading,
  Select,
  TextInput,
  ToggleGroup,
} from './ui'
import { ProofProgress } from './ProofProgress'

function timeAgo(timestamp: number): string {
  const mins = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  return `${hours}h ago`
}

function OrderRow({
  order,
  canceling,
  onCancel,
}: {
  order: OpenOrder
  canceling: boolean
  onCancel: () => void
}) {
  const buy = order.side === 'buy'
  return (
    <li className="flex items-center gap-4 py-3.5">
      <Badge tone={buy ? 'accent' : 'neutral'} className="uppercase">
        {order.side}
      </Badge>
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100">{order.pair}</div>
        <div className="text-xs text-zinc-500">
          filled {order.filled} / {order.amount} · {timeAgo(order.createdAt)}
        </div>
      </div>
      <div className="ml-auto text-right">
        <div className="font-mono text-sm tabular-nums text-zinc-100">
          {order.price} {order.quote}
        </div>
        <div className="text-xs text-zinc-500">
          {order.amount} {order.base}
        </div>
      </div>
      <Button variant="outline" size="sm" loading={canceling} onClick={onCancel}>
        Cancel
      </Button>
    </li>
  )
}

function OrderSkeleton() {
  return (
    <ul className="divide-y divide-ink-800">
      {[0, 1].map((i) => (
        <li key={i} className="flex items-center gap-4 py-3.5">
          <div className="h-6 w-12 animate-pulse rounded-full bg-ink-700" />
          <div className="space-y-2">
            <div className="h-3.5 w-20 animate-pulse rounded bg-ink-700" />
            <div className="h-2.5 w-28 animate-pulse rounded bg-ink-800" />
          </div>
          <div className="ml-auto h-7 w-16 animate-pulse rounded bg-ink-800" />
        </li>
      ))}
    </ul>
  )
}

export function Swap({ embedded }: { embedded?: boolean } = {}) {
  const { sdk, orders, loadingOrders, refreshOrders, refreshBalances } = useWraith()
  const proof = useProofFlow()

  const [side, setSide] = useState<OrderSide>('buy')
  const [base, setBase] = useState('XLM')
  const [quote, setQuote] = useState('USDC')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  const valid = base !== quote && parseAmount(price) > 0 && parseAmount(amount) > 0
  const total = valid ? parseAmount(price) * parseAmount(amount) : 0

  async function onPlace() {
    const result = await proof.run(() => sdk.placeOrder({ base, quote, side, price, amount }))
    if (result) {
      await refreshOrders()
      await refreshBalances()
    }
  }

  function closeOverlay() {
    const succeeded = proof.status === 'done'
    proof.reset()
    if (succeeded) {
      setPrice('')
      setAmount('')
    }
  }

  async function onCancel(id: string) {
    setCancelingId(id)
    try {
      await sdk.cancelOrder(id)
      await refreshOrders()
      await refreshBalances()
    } finally {
      setCancelingId(null)
    }
  }

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6'}>
      {!embedded && (
        <PageIntro title="Swap" subtitle="Dark-pool DEX. Orders stay sealed until matched, so there is no front-running." />
      )}

      <div className={embedded ? 'space-y-5' : 'grid gap-5 lg:grid-cols-5'}>
        <Card className="p-6 lg:col-span-2">
          <SectionHeading icon={<ChartIcon className="h-4 w-4" />} title="Place order" />

          <div className="mb-4 mt-3 grid grid-cols-2 gap-3">
            <Field label="Base">
              <Select value={base} onChange={(e) => setBase(e.target.value)} options={TOKEN_OPTIONS} />
            </Field>
            <Field label="Quote">
              <Select value={quote} onChange={(e) => setQuote(e.target.value)} options={TOKEN_OPTIONS} />
            </Field>
          </div>
          {base === quote && (
            <p className="mb-3 text-xs text-spectral/80">Pick two different tokens.</p>
          )}

          <div className="space-y-4">
            <ToggleGroup
              value={side}
              onChange={setSide}
              options={[
                { value: 'buy', label: 'Buy' },
                { value: 'sell', label: 'Sell' },
              ]}
            />
            <Field label={`Price (${quote} per ${base})`}>
              <TextInput
                mono
                inputMode="decimal"
                placeholder="0.0000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </Field>
            <Field label={`Amount (${base})`}>
              <TextInput
                mono
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Est. {side === 'buy' ? 'cost' : 'proceeds'}</span>
              <span className="font-mono tabular-nums text-zinc-200">
                {formatAmount(total)} {quote}
              </span>
            </div>
            <Button className="w-full" disabled={!valid} onClick={() => void onPlace()}>
              Place order
            </Button>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-3">
          <SectionHeading title="Open orders" hint={`${orders.length} active`} />
          <div className="mt-2">
            {loadingOrders ? (
              <OrderSkeleton />
            ) : orders.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-500">No open orders.</p>
            ) : (
              <ul className="divide-y divide-ink-800">
                {orders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    canceling={cancelingId === order.id}
                    onCancel={() => void onCancel(order.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <ProofProgress
        flow={proof}
        title="Placing sealed order"
        subject={parseAmount(amount) > 0 ? `${amount} ${base}` : undefined}
        onClose={closeOverlay}
      />
    </div>
  )
}
