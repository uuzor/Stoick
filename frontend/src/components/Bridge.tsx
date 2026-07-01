import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useWraith } from '../hooks/useWraith'
import { useEvmWallet } from '../hooks/useEvmWallet'
import { useWallet } from '../hooks/useWallet'
import { addNote, getSpendingKey, loadNotes, markSpent } from '../lib/note-store'
import { toBaseUnits } from '../lib/real-sdk'
import { ASSET_CODES, BRIDGED_ASSET_CODES } from '../lib/assets'
import { isPositiveAmount, isValidStellarAddress, truncateKey } from '../lib/format'
import type { AssetCode } from '../lib/wraith-sdk'
import {
  ENABLE_WITHDRAW,
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
  ChevronDownIcon,
  PageIntro,
  ShieldIcon,
  Spinner,
  TextInput,
  XIcon,
} from './ui'
import { CoinBadge } from './BrandIcons'

// ---------------------------------------------------------------------------
// Endpoints & routing
//
// The Deposit surface moves value between an external Layer-1 (Stellar or Ethereum)
// and the Wraith shielded pool, in either direction:
//   • deposit  = L1 → Wraith   (fund the pool)
//   • withdraw = Wraith → L1   (redeem back out)
// The Wraith side is always fixed; the L1 side is a chain picker.
// ---------------------------------------------------------------------------

type L1 = 'stellar' | 'ethereum'
type Endpoint = L1 | 'wraith'
type Direction = 'deposit' | 'withdraw'

const ENDPOINT_META: Record<Endpoint, { label: string; sub: string; icon: string }> = {
  stellar: { label: 'Stellar', sub: 'Testnet', icon: 'stellar' },
  ethereum: { label: 'Ethereum', sub: 'Sepolia', icon: 'ethereum' },
  wraith: { label: 'Wraith', sub: 'Shielded pool', icon: 'wraith' },
}

const L1_CHAINS: L1[] = ['stellar', 'ethereum']

/** The L1-native token that enters/leaves each external chain (code = CoinBadge name). */
const L1_TOKEN: Record<L1, string> = { stellar: 'XLM', ethereum: 'ETH' }

/** The shielded asset a deposit from each chain mints on the Wraith side. */
const DEPOSIT_SHIELDED: Record<L1, AssetCode> = { stellar: 'XLM', ethereum: 'bETH' }

/** Which shielded balances can be withdrawn back to each chain. */
const WITHDRAW_CODES: Record<L1, AssetCode[]> = { stellar: ASSET_CODES, ethereum: BRIDGED_ASSET_CODES }

/** The L1 token a shielded code redeems to on withdraw. */
const L1_TOKEN_FOR: Record<AssetCode, string> = {
  XLM: 'XLM',
  USDC: 'USDC',
  bETH: 'ETH',
  bUSDC: 'USDC',
}

const STEP_LABELS: Record<string, string[]> = {
  'deposit:stellar': ['Submit deposit on Stellar', 'Shielded note minted'],
  'deposit:ethereum': ['Lock on Sepolia', 'Header finalized', 'Inclusion proven', 'Minted on Stellar'],
  'withdraw:stellar': ['Prove ownership (ZK)', 'Released on Stellar'],
  'withdraw:ethereum': ['Prove ownership', 'Burn note on Stellar', 'Unlock authorized', 'Released on Sepolia'],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_U64 = 1n << 64n
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const isEvmAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim())
const stellarTxUrl = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`

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

/** Static chain identity (used for the fixed Wraith endpoint). */
function ChainIdentity({ endpoint }: { endpoint: Endpoint }) {
  const m = ENDPOINT_META[endpoint]
  return (
    <span className="flex items-center gap-2 px-2 py-1 text-sm font-medium text-zinc-200">
      <CoinBadge name={m.icon} size="sm" />
      {m.label}
      <span className="text-zinc-600">· {m.sub}</span>
    </span>
  )
}

/** The L1 chain picker (Stellar / Ethereum) shown on the external side. */
function ChainSelect({
  value,
  onChange,
  disabled,
}: {
  value: L1
  onChange: (v: L1) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])
  const m = ENDPOINT_META[value]
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-ink-700 bg-ink-850 px-2 py-1 text-sm font-medium text-zinc-200 transition hover:border-spectral/40 disabled:opacity-60"
      >
        <CoinBadge name={m.icon} size="sm" />
        {m.label}
        <ChevronDownIcon className="h-3.5 w-3.5 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-48 rounded-xl border border-ink-700 bg-ink-850 p-1 shadow-panel animate-fade-in">
          {L1_CHAINS.map((c) => {
            const cm = ENDPOINT_META[c]
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c)
                  setOpen(false)
                }}
                className={cx(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition',
                  c === value ? 'bg-spectral/10 text-zinc-100' : 'text-zinc-300 hover:bg-ink-800',
                )}
              >
                <CoinBadge name={cm.icon} size="sm" />
                <span className="font-medium">{cm.label}</span>
                <span className="ml-auto text-xs text-zinc-600">{cm.sub}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** A From / To endpoint panel (identity row + its asset/amount content). */
function EndpointPanel({
  role,
  identity,
  wallet,
  children,
}: {
  role: 'From' | 'To'
  identity: ReactNode
  wallet?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{role}</span>
        <div className="flex items-center gap-2">
          {wallet}
          {identity}
        </div>
      </div>
      {children}
    </div>
  )
}

/** A read-only token chip (icon + code). */
function TokenChip({ code }: { code: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-sm font-semibold text-zinc-100">
      <CoinBadge name={code} size="sm" />
      {code}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Deposit / withdraw widget
// ---------------------------------------------------------------------------

export function Bridge({ embedded }: { embedded?: boolean } = {}) {
  const { sdk, balances, refreshBalances, identityReady } = useWraith()
  const evm = useEvmWallet()
  const stellar = useWallet()

  const [l1, setL1] = useState<L1>('stellar')
  const [direction, setDirection] = useState<Direction>('deposit')
  const from: Endpoint = direction === 'deposit' ? l1 : 'wraith'
  const to: Endpoint = direction === 'deposit' ? 'wraith' : l1

  const ethToken = BRIDGE_TOKENS.ETH

  // Shielded balances that can be withdrawn back to the selected chain.
  const withdrawBalances = balances.filter((b) => WITHDRAW_CODES[l1].includes(b.asset))
  const [outAsset, setOutAsset] = useState<AssetCode | ''>('')
  const withdrawAsset = (outAsset && withdrawBalances.some((b) => b.asset === outAsset)
    ? outAsset
    : withdrawBalances[0]?.asset ?? '') as AssetCode | ''

  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('') // withdraw only: L1 destination

  const [status, setStatus] = useState<FlowStatus>('idle')
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [l1Hash, setL1Hash] = useState<string | null>(null)
  const [stellarHash, setStellarHash] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  useEffect(() => () => void (cancelledRef.current = true), [])

  const running = status === 'running'
  const amountValid = isPositiveAmount(amount)

  // Token codes shown in the From / To panels.
  const fromCode = direction === 'deposit' ? L1_TOKEN[l1] : withdrawAsset || '—'
  const toCode = direction === 'deposit'
    ? DEPOSIT_SHIELDED[l1]
    : withdrawAsset
      ? L1_TOKEN_FOR[withdrawAsset]
      : L1_TOKEN[l1]

  const steps = STEP_LABELS[`${direction}:${l1}`]

  function reset() {
    setStatus('idle')
    setStep(0)
    setError(null)
    setL1Hash(null)
    setStellarHash(null)
    setAmount('')
    setRecipient('')
  }

  function selectChain(next: L1) {
    if (running || next === l1) return
    setL1(next)
    reset()
  }

  function flip() {
    if (running) return
    setDirection((d) => (d === 'deposit' ? 'withdraw' : 'deposit'))
    reset()
  }

  const creditBridgeNote = useCallback(
    async (note: ReturnType<typeof createBridgeNote>) => {
      if (USE_MOCK) await sdk.deposit({ asset: ethToken.assetCode, amount })
      else addNote(note, { assetCode: ethToken.assetCode })
      await refreshBalances()
    },
    [sdk, ethToken.assetCode, amount, refreshBalances],
  )

  // --- deposit / withdraw flows --------------------------------------------

  /** Stellar → Wraith: a native single-tx deposit into the pool (LIVE). */
  async function runStellarIn() {
    setStep(0)
    const { hash } = await sdk.deposit({ asset: 'XLM', amount })
    setStellarHash(hash)
    setStep(1)
    await refreshBalances()
  }

  /** Ethereum → Wraith: lock on L1, wait for the light client, mint on Stellar. */
  async function runEthIn() {
    const amountBase = (() => {
      try {
        return toBaseUnits(amount, ethToken.decimals)
      } catch {
        return -1n
      }
    })()
    if (amountBase <= 0n) throw new Error('Enter a valid amount.')
    if (amountBase >= MAX_U64) throw new Error('Amount too large for a demo note (must fit 2^64).')

    const note = createBridgeNote({ token: ethToken, amountBase, spendingKey: getSpendingKey() })
    const commitment = commitmentHex(note)

    if (USE_MOCK_BRIDGE) {
      await wait(900); setL1Hash(`0x${commitment.slice(2, 18)}…mock`); setStep(1)
      await wait(1300); setStep(2)
      await wait(1300); setStep(3)
      await wait(1000); await creditBridgeNote(note)
      return
    }

    if (!evm.walletClient || !evm.publicClient || !evm.address) {
      throw new Error('Connect MetaMask on Sepolia first.')
    }
    const { hash, blockNumber } = await lockOnL1({
      walletClient: evm.walletClient,
      publicClient: evm.publicClient,
      account: evm.address,
      token: ethToken,
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
    await creditBridgeNote(note)
  }

  /** Wraith → Stellar: an in-browser ZK withdraw to a classic Stellar account. */
  async function runStellarOut() {
    if (!withdrawAsset) throw new Error('No shielded balance to withdraw.')
    setStep(0)
    const { hash } = await sdk.withdraw({ asset: withdrawAsset, amount, recipient })
    setStellarHash(hash)
    setStep(1)
    await refreshBalances()
  }

  function debitBridgeNotes(code: AssetCode, amt: string) {
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

  /** Wraith → Ethereum: burn the shielded note, unlock the L1 backing (preview). */
  async function runEthOut() {
    if (!USE_MOCK_BRIDGE) {
      throw new Error(
        'Live bridge-out needs the in-browser withdraw prover (VITE_ENABLE_WITHDRAW). Run with VITE_USE_MOCK_BRIDGE=true to preview the burn → unlock flow.',
      )
    }
    await wait(1100); setStep(1)
    await wait(1000); setStep(2)
    await wait(1100); setStep(3)
    await wait(900)
    debitBridgeNotes(withdrawAsset as AssetCode, amount)
    await refreshBalances()
  }

  async function run() {
    setError(null); setL1Hash(null); setStellarHash(null); setStatus('running'); setStep(0)
    cancelledRef.current = false
    try {
      if (direction === 'deposit') l1 === 'stellar' ? await runStellarIn() : await runEthIn()
      else l1 === 'stellar' ? await runStellarOut() : await runEthOut()
      setStatus('done')
    } catch (err) {
      if (cancelledRef.current) return
      setError(err instanceof Error ? err.message : 'Transfer failed.')
      setStatus('error')
    }
  }

  // --- context-aware primary action ----------------------------------------

  const action: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean } = (() => {
    if (running) return { label: 'Working…', onClick: () => {}, loading: true }
    // Every shielded note is owned by the wallet-derived identity, so a connected
    // Stellar wallet (and its derived key) is required for both directions.
    if (!USE_MOCK && stellar.status !== 'connected')
      return { label: 'Connect Stellar wallet', onClick: () => void stellar.connect() }
    if (!USE_MOCK && !identityReady)
      return { label: 'Preparing shielded identity…', onClick: () => {}, disabled: true }
    if (direction === 'deposit') {
      if (l1 === 'stellar') {
        if (!amountValid) return { label: 'Enter an amount', onClick: () => {}, disabled: true }
        return { label: 'Deposit', onClick: () => void run() }
      }
      // ethereum deposit
      if (!USE_MOCK_BRIDGE && !BRIDGE_CONFIGURED) return { label: 'Bridge unavailable', onClick: () => {}, disabled: true }
      if (!USE_MOCK_BRIDGE && !evm.isConnected)
        return { label: evm.hasInjected ? 'Connect MetaMask' : 'No injected wallet', onClick: evm.connect, disabled: !evm.hasInjected }
      if (!USE_MOCK_BRIDGE && !evm.isSepolia) return { label: 'Switch to Sepolia', onClick: evm.switchToSepolia }
      if (!amountValid) return { label: 'Enter an amount', onClick: () => {}, disabled: true }
      return { label: 'Deposit', onClick: () => void run() }
    }
    // withdraw
    if (withdrawBalances.length === 0) return { label: 'No shielded balance', onClick: () => {}, disabled: true }
    if (!amountValid) return { label: 'Enter an amount', onClick: () => {}, disabled: true }
    const okRecipient = l1 === 'stellar' ? isValidStellarAddress(recipient) : isEvmAddress(recipient)
    if (!okRecipient) return { label: 'Enter recipient address', onClick: () => {}, disabled: true }
    return { label: 'Withdraw', onClick: () => void run() }
  })()

  // Origin-wallet affordance shown inline in the From panel (EVM origin only).
  const evmWalletChip =
    direction === 'deposit' && l1 === 'ethereum' && !USE_MOCK_BRIDGE && evm.isConnected && evm.address ? (
      <button
        type="button"
        onClick={evm.disconnect}
        className="font-mono text-xs text-zinc-400 hover:text-zinc-200"
        title="Disconnect"
      >
        {truncateKey(evm.address, 4, 4)}
      </button>
    ) : undefined

  const fromIdentity =
    from === 'wraith' ? (
      <ChainIdentity endpoint="wraith" />
    ) : (
      <ChainSelect value={l1} onChange={selectChain} disabled={running} />
    )
  const toIdentity =
    to === 'wraith' ? (
      <ChainIdentity endpoint="wraith" />
    ) : (
      <ChainSelect value={l1} onChange={selectChain} disabled={running} />
    )

  // Experimental notices (withdraw paths are gated on the ZK prover).
  const withdrawGated =
    direction === 'withdraw' &&
    (l1 === 'stellar' ? !USE_MOCK && !ENABLE_WITHDRAW : !USE_MOCK_BRIDGE)

  const showTracker = status !== 'idle'
  const withdrawFromBalance = withdrawBalances.find((b) => b.asset === withdrawAsset)?.amount ?? '0'

  function stepDetail(i: number): ReactNode {
    if (direction === 'deposit' && l1 === 'ethereum' && i === 0 && l1Hash) {
      return USE_MOCK_BRIDGE ? (
        <span className="font-mono">{l1Hash}</span>
      ) : (
        <TxLink href={sepoliaTxUrl(l1Hash)} label={truncateKey(l1Hash, 8, 6)} />
      )
    }
    if (direction === 'deposit' && l1 === 'ethereum' && i === 3 && status === 'done' && WRAITH_BRIDGE_ID && !USE_MOCK_BRIDGE) {
      return <TxLink href={stellarContractUrl(WRAITH_BRIDGE_ID)} label="WraithBridge" />
    }
    if (l1 === 'stellar' && stellarHash && !USE_MOCK) {
      const last = steps.length - 1
      if ((direction === 'deposit' && i === 0) || (direction === 'withdraw' && i === last)) {
        return <TxLink href={stellarTxUrl(stellarHash)} label={truncateKey(stellarHash, 8, 6)} />
      }
    }
    return undefined
  }

  return (
    <div className={embedded ? 'space-y-5' : 'mx-auto max-w-xl space-y-6'}>
      {!embedded && (
        <PageIntro
          title="Deposit"
          subtitle="Move assets between Layer 1 and the Wraith shielded pool — deposit in, or withdraw back out."
        />
      )}

      <Card className="p-5">
        {/* From */}
        <EndpointPanel role="From" identity={fromIdentity} wallet={evmWalletChip}>
          <div className="flex items-center gap-3">
            <input
              className="input input-mono flex-1 border-none bg-transparent px-0 text-2xl focus:ring-0"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={running}
            />
            {direction === 'withdraw' && withdrawBalances.length > 0 ? (
              <div className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-2.5 py-2">
                <CoinBadge name={withdrawAsset || '—'} size="sm" />
                <select
                  className="cursor-pointer appearance-none bg-transparent text-sm font-semibold text-zinc-100 focus:outline-none"
                  value={withdrawAsset}
                  onChange={(e) => setOutAsset(e.target.value as AssetCode)}
                  disabled={running}
                >
                  {withdrawBalances.map((b) => (
                    <option key={b.asset} value={b.asset} className="bg-ink-850">
                      {b.asset}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <TokenChip code={String(fromCode)} />
            )}
          </div>
          {direction === 'withdraw' && withdrawAsset && (
            <button
              type="button"
              className="mt-2 text-xs text-zinc-500 hover:text-spectral-soft"
              onClick={() => setAmount(withdrawFromBalance)}
              disabled={running}
            >
              Balance: <span className="font-mono">{withdrawFromBalance}</span> · Max
            </button>
          )}
        </EndpointPanel>

        {/* Flip direction */}
        <div className="relative flex h-2 justify-center">
          <button
            type="button"
            onClick={flip}
            disabled={running}
            aria-label="Switch direction"
            className="absolute -top-3 flex h-9 w-9 items-center justify-center rounded-xl border border-ink-700 bg-ink-850 text-zinc-300 transition hover:border-spectral/50 hover:text-spectral-soft disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path d="M7 4v16m0 0 3-3m-3 3-3-3M17 20V4m0 0 3 3m-3-3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* To */}
        <EndpointPanel role="To" identity={toIdentity}>
          <div className="flex items-center gap-3">
            <div className="input input-mono flex-1 border-none bg-transparent px-0 text-2xl text-zinc-400">
              {amountValid ? amount : '0.00'}
            </div>
            <TokenChip code={String(toCode)} />
          </div>
          {direction === 'withdraw' && (
            <TextInput
              mono
              className="mt-3"
              placeholder={l1 === 'stellar' ? 'Stellar recipient · G…' : 'Ethereum recipient · 0x…'}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={running}
            />
          )}
        </EndpointPanel>

        {/* Config warning (Ethereum deposit, live but unconfigured) */}
        {direction === 'deposit' && l1 === 'ethereum' && !USE_MOCK_BRIDGE && !BRIDGE_CONFIGURED && (
          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300">
            Live bridge addresses are not configured. Set the <span className="font-mono">VITE_*</span> bridge vars, or run with{' '}
            <span className="font-mono">VITE_USE_MOCK_BRIDGE=true</span>.
          </p>
        )}

        {/* Withdraw is gated on the in-browser ZK prover */}
        {withdrawGated && (
          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300">
            {l1 === 'stellar'
              ? 'Withdraw runs an in-browser ZK proof (experimental). Enable it with VITE_ENABLE_WITHDRAW=true.'
              : 'Bridge-out reuses the withdraw prover (experimental). Preview the burn → unlock flow with VITE_USE_MOCK_BRIDGE=true.'}
          </p>
        )}

        <Button className="mt-5 w-full" onClick={action.onClick} disabled={action.disabled} loading={action.loading}>
          {action.label}
        </Button>

        {l1 === 'ethereum' ? (
          <ProvenanceStrip />
        ) : (
          <p className="mt-3 text-center text-xs text-zinc-500">
            {direction === 'deposit'
              ? 'Funds enter the shielded pool directly on Stellar Testnet.'
              : 'Redeems a shielded note back to a classic Stellar account.'}
          </p>
        )}
      </Card>

      {/* Progress */}
      {showTracker && (
        <Card className="p-5 animate-fade-in">
          <div className="mb-4 flex items-center justify-between">
            <span className="panel-title">{direction === 'deposit' ? 'Depositing' : 'Withdrawing'}</span>
            <span className="font-mono text-xs text-zinc-500">
              {ENDPOINT_META[from].label} → {ENDPOINT_META[to].label}
            </span>
          </div>
          <ol className="space-y-4">
            {steps.map((label, i) => (
              <StepRow key={label} label={label} state={stepStateFor(i, step, status)} detail={stepDetail(i)} />
            ))}
          </ol>
          {status === 'error' && error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          {status === 'done' && (
            <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300">
              <CheckIcon className="h-4 w-4" />
              {direction === 'deposit' ? (
                <>Shielded {String(toCode)} now visible in Portfolio.</>
              ) : l1 === 'stellar' ? (
                <>Released to {truncateKey(recipient, 6, 6)} on Stellar.</>
              ) : (
                <>Released to {truncateKey(recipient, 6, 6)} on Sepolia.</>
              )}
            </p>
          )}
          {(status === 'done' || status === 'error') && (
            <Button variant="outline" className="mt-5 w-full" onClick={reset}>
              {direction === 'deposit' ? 'Deposit again' : 'Withdraw again'}
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}
