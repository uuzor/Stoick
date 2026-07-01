import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useWraith } from '../hooks/useWraith'
import { useEvmWallet } from '../hooks/useEvmWallet'
import { addNote, getSpendingKey, loadNotes, markSpent } from '../lib/note-store'
import { toBaseUnits } from '../lib/real-sdk'
import { BRIDGED_ASSET_CODES } from '../lib/assets'
import { isPositiveAmount, truncateKey } from '../lib/format'
import type { AssetCode } from '../lib/wraith-sdk'
import {
  ETH_LIGHT_CLIENT_ID,
  L1_BRIDGE_ADDRESS,
  USE_MOCK,
  USE_MOCK_BRIDGE,
  WRAITH_BRIDGE_ID,
} from '../lib/config'
import {
  BRIDGE_TOKENS,
  commitmentHex,
  createBridgeNote,
  type BridgeTokenSymbol,
  type LightClientHead,
  lockOnL1,
  readIsBridged,
  readLightClientHead,
  requestBridgeIn,
  sepoliaTxUrl,
  stellarContractUrl,
} from '../lib/bridge'
import { cx } from '../lib/cx'
import {
  Button,
  Card,
  CheckIcon,
  PageIntro,
  ShieldIcon,
  Spinner,
  TextInput,
  XIcon,
} from './ui'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_U64 = 1n << 64n
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const isEvmAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim())

async function pollUntil(
  fn: () => Promise<boolean>,
  opts: { intervalMs: number; timeoutMs: number; signal: () => boolean },
): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs
  for (;;) {
    if (opts.signal()) return false
    try {
      if (await fn()) return true
    } catch {
      /* transient RPC error — keep polling */
    }
    if (Date.now() > deadline) return false
    await wait(opts.intervalMs)
  }
}

/** A believable, slowly-advancing Sepolia head used when the light client isn't deployed. */
const simulatedHeadBlock = (): bigint =>
  8_900_000n + BigInt(Math.floor(Date.now() / 12_000) % 50_000)

const BRIDGE_CONFIGURED =
  L1_BRIDGE_ADDRESS.toLowerCase() !== '0x0000000000000000000000000000000000000000' &&
  Boolean(ETH_LIGHT_CLIENT_ID) &&
  Boolean(WRAITH_BRIDGE_ID)

type FlowStatus = 'idle' | 'running' | 'done' | 'error'
type StepState = 'pending' | 'active' | 'done' | 'error'

// Chain identity for the From/To panels. Only two endpoints: an EVM chain and
// the Wraith shielded pool. Direction is inferred from which is `from`.
type ChainId = 'ethereum' | 'wraith'
const CHAIN_META: Record<ChainId, { label: string; sub: string; dot: string }> = {
  ethereum: { label: 'Ethereum', sub: 'Sepolia', dot: 'bg-[#8aa0e6]' },
  wraith: { label: 'Wraith', sub: 'Shielded pool', dot: 'bg-spectral' },
}

const IN_STEPS = ['Lock on Sepolia', 'Header finalized', 'Inclusion proven', 'Minted on Stellar']
const OUT_STEPS = ['Prove ownership', 'Burn note on Stellar', 'Unlock authorized', 'Released on Sepolia']

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function StepRow({ label, state, detail }: { label: string; state: StepState; detail?: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cx(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
          state === 'done' && 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
          state === 'active' && 'border-spectral/50 bg-spectral/15 text-spectral-soft',
          state === 'pending' && 'border-ink-600 bg-ink-800 text-zinc-600',
          state === 'error' && 'border-red-500/50 bg-red-500/15 text-red-300',
        )}
      >
        {state === 'done' && <CheckIcon className="h-3.5 w-3.5" />}
        {state === 'active' && <Spinner className="h-3.5 w-3.5" />}
        {state === 'error' && <XIcon className="h-3.5 w-3.5" />}
        {state === 'pending' && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <div className="min-w-0">
        <div
          className={cx(
            'text-sm',
            state === 'pending' ? 'text-zinc-600' : state === 'error' ? 'text-red-300' : 'text-zinc-200',
          )}
        >
          {label}
        </div>
        {detail && <div className="mt-0.5 text-xs text-zinc-500">{detail}</div>}
      </div>
    </li>
  )
}

function stepStateFor(index: number, step: number, status: FlowStatus): StepState {
  if (status === 'error' && index === step) return 'error'
  if (status === 'done') return 'done'
  if (index < step) return 'done'
  if (index === step && status === 'running') return 'active'
  return 'pending'
}

function TxLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-spectral-soft underline-offset-2 hover:underline"
    >
      {label} ↗
    </a>
  )
}

/** Compact provenance strip — the trusted Ethereum head the bridge verifies against. */
function ProvenanceStrip() {
  const [head, setHead] = useState<LightClientHead | null>(null)
  const simulated = USE_MOCK_BRIDGE || !ETH_LIGHT_CLIENT_ID

  useEffect(() => {
    let cancelled = false
    async function load() {
      const h = simulated
        ? { blockNumber: simulatedHeadBlock(), stateRoot: '0x' as `0x${string}` }
        : await readLightClientHead()
      if (!cancelled) setHead(h)
    }
    void load()
    const id = setInterval(() => void load(), 15_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [simulated])

  return (
    <div className="mt-3 flex items-center justify-center gap-2 text-xs text-zinc-500">
      <ShieldIcon className="h-3.5 w-3.5 text-spectral-dim" />
      <span>
        Provenance: Ethereum light client{' '}
        <span className={cx('font-medium', simulated ? 'text-amber-400/80' : 'text-emerald-400/80')}>
          {simulated ? 'simulated' : 'live'}
        </span>
        {head && (
          <>
            {' · head '}
            <span className="font-mono text-zinc-400">#{head.blockNumber.toString()}</span>
          </>
        )}
      </span>
    </div>
  )
}

/** A From / To endpoint panel (chain identity + its asset/amount content). */
function EndpointPanel({
  role,
  chain,
  wallet,
  children,
}: {
  role: 'From' | 'To'
  chain: ChainId
  wallet?: ReactNode
  children: ReactNode
}) {
  const m = CHAIN_META[chain]
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{role}</span>
        <div className="flex items-center gap-2">
          {wallet}
          <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <span className={cx('h-1.5 w-1.5 rounded-full', m.dot)} />
            {m.label}
            <span className="text-zinc-600">· {m.sub}</span>
          </span>
        </div>
      </div>
      {children}
    </div>
  )
}

/** An asset chip shown inside a panel (no dropdown when there is a single option). */
function AssetChip({ code }: { code: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-sm font-semibold text-zinc-100">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-spectral/15 font-mono text-[9px] text-spectral-soft">
        {code.replace(/^b/, '').slice(0, 3)}
      </span>
      {code}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Bridge — unified from → to
// ---------------------------------------------------------------------------

export function Bridge({ embedded }: { embedded?: boolean } = {}) {
  const { sdk, balances, refreshBalances } = useWraith()
  const evm = useEvmWallet()

  // Direction is inferred from `from`. ethereum→wraith = "in"; wraith→ethereum = "out".
  const [from, setFrom] = useState<ChainId>('ethereum')
  const to: ChainId = from === 'ethereum' ? 'wraith' : 'ethereum'
  const direction: 'in' | 'out' = from === 'ethereum' ? 'in' : 'out'

  // Inbound asset (L1 token) and outbound note selection.
  const [tokenSym] = useState<BridgeTokenSymbol>('ETH')
  const token = BRIDGE_TOKENS[tokenSym]
  const bridged = balances.filter((b) => BRIDGED_ASSET_CODES.includes(b.asset))
  const [outAsset, setOutAsset] = useState<AssetCode | ''>('')
  const outSelected = (outAsset || bridged[0]?.asset || '') as AssetCode | ''

  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('') // out only: Ethereum destination

  const [status, setStatus] = useState<FlowStatus>('idle')
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [l1Hash, setL1Hash] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  useEffect(() => () => void (cancelledRef.current = true), [])

  const running = status === 'running'
  const amountValid = isPositiveAmount(amount)

  // Derived From/To asset codes.
  const fromCode = direction === 'in' ? token.symbol : (outSelected || '—')
  const toCode = direction === 'in' ? token.assetCode : (outSelected ? outSelected.replace(/^b/, '') : '—')

  function flip() {
    if (running) return
    setFrom(to)
    reset()
  }

  function reset() {
    setStatus('idle')
    setStep(0)
    setError(null)
    setL1Hash(null)
    setAmount('')
    setRecipient('')
  }

  const creditBalance = useCallback(
    async (note: ReturnType<typeof createBridgeNote>) => {
      if (USE_MOCK) await sdk.deposit({ asset: token.assetCode, amount })
      else addNote(note, { assetCode: token.assetCode })
      await refreshBalances()
    },
    [sdk, token.assetCode, amount, refreshBalances],
  )

  // --- flows (logic preserved from the previous in/out implementation) ------

  async function runIn() {
    const amountBase = (() => {
      try {
        return toBaseUnits(amount, token.decimals)
      } catch {
        return -1n
      }
    })()
    if (amountBase <= 0n) throw new Error('Enter a valid amount.')
    if (amountBase >= MAX_U64) throw new Error('Amount too large for a demo note (must fit 2^64).')

    const note = createBridgeNote({ token, amountBase, spendingKey: getSpendingKey() })
    const commitment = commitmentHex(note)

    if (USE_MOCK_BRIDGE) {
      await wait(900); setL1Hash(`0x${commitment.slice(2, 18)}…mock`); setStep(1)
      await wait(1300); setStep(2)
      await wait(1300); setStep(3)
      await wait(1000); await creditBalance(note)
      return
    }

    if (!evm.walletClient || !evm.publicClient || !evm.address) {
      throw new Error('Connect MetaMask on Sepolia first.')
    }
    const { hash, blockNumber } = await lockOnL1({
      walletClient: evm.walletClient,
      publicClient: evm.publicClient,
      account: evm.address,
      token,
      amountBase,
      commitment,
    })
    setL1Hash(hash); setStep(1)

    void requestBridgeIn(commitment)
    const finalized = await pollUntil(
      async () => {
        const head = await readLightClientHead()
        return Boolean(head && head.blockNumber >= blockNumber)
      },
      { intervalMs: 10_000, timeoutMs: 6 * 60_000, signal: () => cancelledRef.current },
    )
    if (!finalized) throw new Error('Timed out waiting for the light client to finalize the lock. Is the relayer feeding headers?')
    setStep(2)

    const minted = await pollUntil(() => readIsBridged(commitment).then((b) => b === true), {
      intervalMs: 8_000,
      timeoutMs: 6 * 60_000,
      signal: () => cancelledRef.current,
    })
    if (!minted) throw new Error('Timed out waiting for the mint on Stellar. Is the relayer submitting inclusion proofs?')
    setStep(3)
    await creditBalance(note)
  }

  function debitBalance(code: AssetCode, amt: string) {
    if (USE_MOCK) {
      void sdk.withdraw({ asset: code, amount: amt, recipient })
      return
    }
    let remaining = (() => {
      try {
        return toBaseUnits(amt, code === 'bETH' ? 18 : 6)
      } catch {
        return 0n
      }
    })()
    for (const n of loadNotes()) {
      if (n.spent || n.assetCode !== code) continue
      markSpent(n.commitment)
      remaining -= BigInt(n.amount)
      if (remaining <= 0n) break
    }
  }

  async function runOut() {
    if (!USE_MOCK_BRIDGE) {
      throw new Error(
        'Live bridge-out needs the in-browser withdraw prover (VITE_ENABLE_WITHDRAW). Run with VITE_USE_MOCK_BRIDGE=true to preview the burn → unlock flow.',
      )
    }
    await wait(1100); setStep(1)
    await wait(1000); setStep(2)
    await wait(1100); setStep(3)
    await wait(900)
    debitBalance(outSelected as AssetCode, amount)
    await refreshBalances()
  }

  async function run() {
    setError(null); setL1Hash(null); setStatus('running'); setStep(0)
    cancelledRef.current = false
    try {
      if (direction === 'in') await runIn()
      else await runOut()
      setStatus('done')
    } catch (err) {
      if (cancelledRef.current) return
      setError(err instanceof Error ? err.message : 'Bridge failed.')
      setStatus('error')
    }
  }

  // --- context-aware primary action ----------------------------------------

  const action: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean } = (() => {
    if (running) return { label: 'Bridging…', onClick: () => {}, loading: true }
    if (direction === 'in') {
      if (!USE_MOCK_BRIDGE && !BRIDGE_CONFIGURED) return { label: 'Bridge unavailable', onClick: () => {}, disabled: true }
      if (!USE_MOCK_BRIDGE && !evm.isConnected)
        return { label: evm.hasInjected ? 'Connect MetaMask' : 'No injected wallet', onClick: evm.connect, disabled: !evm.hasInjected }
      if (!USE_MOCK_BRIDGE && !evm.isSepolia) return { label: 'Switch to Sepolia', onClick: evm.switchToSepolia }
      if (!amountValid) return { label: 'Enter an amount', onClick: () => {}, disabled: true }
      return { label: 'Bridge', onClick: () => void run() }
    }
    // out
    if (bridged.length === 0) return { label: 'No shielded balance to bridge', onClick: () => {}, disabled: true }
    if (!amountValid) return { label: 'Enter an amount', onClick: () => {}, disabled: true }
    if (!isEvmAddress(recipient)) return { label: 'Enter recipient address', onClick: () => {}, disabled: true }
    return { label: 'Bridge', onClick: () => void run() }
  })()

  // Origin-wallet affordance shown inline in the From panel (only for the EVM origin).
  const evmWalletChip =
    direction === 'in' && !USE_MOCK_BRIDGE ? (
      evm.isConnected && evm.address ? (
        <button
          type="button"
          onClick={evm.disconnect}
          className="font-mono text-xs text-zinc-400 hover:text-zinc-200"
          title="Disconnect"
        >
          {truncateKey(evm.address, 4, 4)}
        </button>
      ) : null
    ) : undefined

  const steps = direction === 'in' ? IN_STEPS : OUT_STEPS
  const showTracker = status !== 'idle'

  return (
    <div className={embedded ? 'space-y-5' : 'mx-auto max-w-xl space-y-6'}>
      {!embedded && (
        <PageIntro
          title="Bridge"
          subtitle="Move assets into and out of the Wraith shielded pool, with provenance proven on-chain rather than attested by a committee."
        />
      )}

      <Card className="p-5">
        {/* From */}
        <EndpointPanel role="From" chain={from} wallet={evmWalletChip}>
          <div className="flex items-center gap-3">
            <input
              className="input input-mono flex-1 border-none bg-transparent px-0 text-2xl focus:ring-0"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={running}
            />
            {direction === 'out' && bridged.length > 0 ? (
              <select
                className="input w-auto cursor-pointer appearance-none py-2 text-sm font-semibold"
                value={outSelected}
                onChange={(e) => setOutAsset(e.target.value as AssetCode)}
                disabled={running}
              >
                {bridged.map((b) => (
                  <option key={b.asset} value={b.asset} className="bg-ink-850">
                    {b.asset}
                  </option>
                ))}
              </select>
            ) : (
              <AssetChip code={String(fromCode)} />
            )}
          </div>
          {direction === 'out' && outSelected && (
            <button
              type="button"
              className="mt-2 text-xs text-zinc-500 hover:text-spectral-soft"
              onClick={() => setAmount(bridged.find((b) => b.asset === outSelected)?.amount ?? '')}
              disabled={running}
            >
              Balance: <span className="font-mono">{bridged.find((b) => b.asset === outSelected)?.amount ?? '0'}</span> · Max
            </button>
          )}
        </EndpointPanel>

        {/* Flip */}
        <div className="relative flex h-2 justify-center">
          <button
            type="button"
            onClick={flip}
            disabled={running}
            aria-label="Swap direction"
            className="absolute -top-3 flex h-9 w-9 items-center justify-center rounded-xl border border-ink-700 bg-ink-850 text-zinc-300 transition hover:border-spectral/50 hover:text-spectral-soft disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path d="M7 4v16m0 0 3-3m-3 3-3-3M17 20V4m0 0 3 3m-3-3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* To */}
        <EndpointPanel role="To" chain={to}>
          <div className="flex items-center gap-3">
            <div className="input input-mono flex-1 border-none bg-transparent px-0 text-2xl text-zinc-400">
              {amountValid ? amount : '0.00'}
            </div>
            <AssetChip code={String(toCode)} />
          </div>
          {direction === 'out' && (
            <TextInput
              mono
              className="mt-3"
              placeholder="Ethereum recipient · 0x…"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={running}
            />
          )}
        </EndpointPanel>

        {/* Config warning (live, unconfigured) */}
        {direction === 'in' && !USE_MOCK_BRIDGE && !BRIDGE_CONFIGURED && (
          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300">
            Live bridge addresses are not configured. Set the <span className="font-mono">VITE_*</span> bridge vars, or run with{' '}
            <span className="font-mono">VITE_USE_MOCK_BRIDGE=true</span>.
          </p>
        )}

        <Button className="mt-5 w-full" onClick={action.onClick} disabled={action.disabled} loading={action.loading}>
          {action.label}
        </Button>

        <ProvenanceStrip />
      </Card>

      {/* Progress */}
      {showTracker && (
        <Card className="p-5 animate-fade-in">
          <div className="mb-4 flex items-center justify-between">
            <span className="panel-title">{direction === 'in' ? 'Bridging in' : 'Bridging out'}</span>
            <span className="font-mono text-xs text-zinc-500">
              {CHAIN_META[from].label} → {CHAIN_META[to].label}
            </span>
          </div>
          <ol className="space-y-4">
            {steps.map((label, i) => (
              <StepRow
                key={label}
                label={label}
                state={stepStateFor(i, step, status)}
                detail={
                  direction === 'in' && i === 0 && l1Hash ? (
                    USE_MOCK_BRIDGE ? (
                      <span className="font-mono">{l1Hash}</span>
                    ) : (
                      <TxLink href={sepoliaTxUrl(l1Hash)} label={truncateKey(l1Hash, 8, 6)} />
                    )
                  ) : direction === 'in' && i === 3 && status === 'done' && WRAITH_BRIDGE_ID && !USE_MOCK_BRIDGE ? (
                    <TxLink href={stellarContractUrl(WRAITH_BRIDGE_ID)} label="WraithBridge" />
                  ) : undefined
                }
              />
            ))}
          </ol>
          {status === 'error' && error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          {status === 'done' && (
            <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300">
              <CheckIcon className="h-4 w-4" />
              {direction === 'in' ? (
                <>Shielded {token.assetCode} now visible in Portfolio.</>
              ) : (
                <>Released to {truncateKey(recipient, 6, 6)} on Sepolia.</>
              )}
            </p>
          )}
          {(status === 'done' || status === 'error') && (
            <Button variant="outline" className="mt-5 w-full" onClick={reset}>
              Bridge again
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}
