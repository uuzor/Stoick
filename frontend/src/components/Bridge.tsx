import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useWraith } from '../hooks/useWraith'
import { useWallet } from '../hooks/useWallet'
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
  BRIDGE_TOKEN_OPTIONS,
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
  ArrowDownIcon,
  ArrowUpIcon,
  Badge,
  Button,
  Card,
  CheckIcon,
  Field,
  PageIntro,
  SectionHeading,
  Select,
  ShieldIcon,
  Spinner,
  TextInput,
  ToggleGroup,
  XIcon,
} from './ui'

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const MAX_U64 = 1n << 64n

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Poll `fn` until it resolves true or the timeout elapses. Returns success. */
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

const isEvmAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim())

/** A believable, slowly-advancing Sepolia head used when the light client isn't deployed. */
function simulatedHeadBlock(): bigint {
  return 8_900_000n + BigInt(Math.floor(Date.now() / 12_000) % 50_000)
}

type StepState = 'pending' | 'active' | 'done' | 'error'
type FlowStatus = 'idle' | 'running' | 'done' | 'error'

const BRIDGE_CONFIGURED =
  L1_BRIDGE_ADDRESS.toLowerCase() !== '0x0000000000000000000000000000000000000000' &&
  Boolean(ETH_LIGHT_CLIENT_ID) &&
  Boolean(WRAITH_BRIDGE_ID)

// ---------------------------------------------------------------------------
// Shared step row + tracker
// ---------------------------------------------------------------------------

function StepRow({
  label,
  state,
  detail,
}: {
  label: string
  state: StepState
  detail?: ReactNode
}) {
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
            'text-sm transition-colors',
            state === 'pending'
              ? 'text-zinc-600'
              : state === 'error'
                ? 'text-red-300'
                : 'text-zinc-200',
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

// ---------------------------------------------------------------------------
// Light-client status chip
// ---------------------------------------------------------------------------

function LightClientChip() {
  const [head, setHead] = useState<LightClientHead | null>(null)
  const [loading, setLoading] = useState(true)
  const simulated = USE_MOCK_BRIDGE || !ETH_LIGHT_CLIENT_ID

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (simulated) {
        if (!cancelled) {
          setHead({ blockNumber: simulatedHeadBlock(), stateRoot: '0x' as `0x${string}` })
          setLoading(false)
        }
        return
      }
      const h = await readLightClientHead()
      if (!cancelled) {
        setHead(h)
        setLoading(false)
      }
    }
    void load()
    const id = setInterval(() => void load(), 15_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [simulated])

  const block = head ? head.blockNumber.toString() : '—'
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-spectral/15 text-spectral-soft">
        <ShieldIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="panel-title">Ethereum light client</span>
          <Badge tone={simulated ? 'warn' : 'success'}>{simulated ? 'simulated' : 'live'}</Badge>
        </div>
        <div className="text-xs text-zinc-500">
          {loading ? 'Reading trusted head…' : <>Trusted head block <span className="font-mono text-zinc-300">#{block}</span> · verified via Ethereum sync committee on Stellar</>}
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Wallet connections (EVM + Stellar)
// ---------------------------------------------------------------------------

function Connections() {
  const evm = useEvmWallet()
  const stellar = useWallet()

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">Ethereum · Sepolia</span>
          {evm.isConnected && (
            <Badge tone={evm.isSepolia ? 'success' : 'warn'}>
              {evm.isSepolia ? 'Sepolia' : 'wrong network'}
            </Badge>
          )}
        </div>
        {evm.isConnected && evm.address ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-zinc-300">{truncateKey(evm.address, 6, 6)}</span>
            {!evm.isSepolia && (
              <Button size="sm" variant="outline" onClick={evm.switchToSepolia}>
                Switch
              </Button>
            )}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={evm.disconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            className="w-full"
            loading={evm.connecting}
            disabled={!evm.hasInjected}
            onClick={evm.connect}
          >
            {evm.hasInjected ? 'Connect MetaMask' : 'No injected wallet'}
          </Button>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">Stellar · Testnet</span>
          {stellar.status === 'connected' && (
            <Badge tone={stellar.isTestnet ? 'success' : 'warn'}>{stellar.network ?? '—'}</Badge>
          )}
        </div>
        {stellar.status === 'connected' && stellar.address ? (
          <span className="font-mono text-xs text-zinc-300">{truncateKey(stellar.address, 6, 6)}</span>
        ) : (
          <Button
            size="sm"
            className="w-full"
            loading={stellar.status === 'connecting'}
            onClick={() => void stellar.connect()}
          >
            Connect Stellar wallet
          </Button>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bridge In (Sepolia -> Stellar)
// ---------------------------------------------------------------------------

const IN_STEPS = [
  'Lock on Sepolia (MetaMask)',
  'Header finalized (light client)',
  'Inclusion proven (relayer)',
  'Minted on Stellar',
]

function BridgeIn() {
  const { sdk, refreshBalances } = useWraith()
  const evm = useEvmWallet()

  const [tokenSym, setTokenSym] = useState<BridgeTokenSymbol>('ETH')
  const [amount, setAmount] = useState('')

  const [status, setStatus] = useState<FlowStatus>('idle')
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [l1Hash, setL1Hash] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const token = BRIDGE_TOKENS[tokenSym]
  const amountValid = isPositiveAmount(amount)

  // Live needs both wallets + deployed contracts; mock needs neither.
  const liveReady = evm.isConnected && evm.isSepolia && BRIDGE_CONFIGURED
  const canStart = amountValid && status !== 'running' && (USE_MOCK_BRIDGE || liveReady)

  useEffect(() => () => {
    cancelledRef.current = true
  }, [])

  /** Surface the bridged balance into Portfolio (mock SDK vs live note-store). */
  const creditBalance = useCallback(
    async (note: ReturnType<typeof createBridgeNote>) => {
      if (USE_MOCK) {
        await sdk.deposit({ asset: token.assetCode, amount })
      } else {
        addNote(note, { assetCode: token.assetCode })
      }
      await refreshBalances()
    },
    [sdk, token.assetCode, amount, refreshBalances],
  )

  async function run() {
    setError(null)
    setL1Hash(null)
    setStatus('running')
    setStep(0)
    cancelledRef.current = false

    const amountBase = (() => {
      try {
        return toBaseUnits(amount, token.decimals)
      } catch {
        return -1n
      }
    })()
    if (amountBase <= 0n) {
      setError('Enter a valid amount.')
      setStatus('error')
      return
    }
    if (amountBase >= MAX_U64) {
      setError('Amount too large for a demo note (must fit in 2^64 base units). Try a smaller amount.')
      setStatus('error')
      return
    }

    const note = createBridgeNote({ token, amountBase, spendingKey: getSpendingKey() })
    const commitment = commitmentHex(note)

    try {
      if (USE_MOCK_BRIDGE) {
        // Self-contained walkthrough — no wallets, fake progress + tx hashes.
        await wait(900)
        setL1Hash(`0x${commitment.slice(2, 18)}…mock`)
        setStep(1)
        await wait(1300)
        setStep(2)
        await wait(1300)
        setStep(3)
        await wait(1100)
        await creditBalance(note)
        setStatus('done')
        return
      }

      // --- LIVE ---
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
      setL1Hash(hash)
      setStep(1)

      // Nudge the relayer (optional) and wait for the light-client head to cover the lock.
      void requestBridgeIn(commitment)
      const finalized = await pollUntil(
        async () => {
          const head = await readLightClientHead()
          return Boolean(head && head.blockNumber >= blockNumber)
        },
        { intervalMs: 10_000, timeoutMs: 6 * 60_000, signal: () => cancelledRef.current },
      )
      if (!finalized) throw new Error('Timed out waiting for the light client to finalize the lock block. Is the relayer feeding headers?')
      setStep(2)

      const minted = await pollUntil(() => readIsBridged(commitment).then((b) => b === true), {
        intervalMs: 8_000,
        timeoutMs: 6 * 60_000,
        signal: () => cancelledRef.current,
      })
      if (!minted) throw new Error('Timed out waiting for bridge_in mint on Stellar. Is the relayer submitting inclusion proofs?')
      setStep(3)

      await creditBalance(note)
      setStatus('done')
    } catch (err) {
      if (cancelledRef.current) return
      setError(err instanceof Error ? err.message : 'Bridge in failed.')
      setStatus('error')
    }
  }

  function reset() {
    setStatus('idle')
    setStep(0)
    setError(null)
    setL1Hash(null)
    setAmount('')
  }

  const showTracker = status !== 'idle'

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="p-6">
        <SectionHeading
          icon={<ArrowDownIcon className="h-4 w-4" />}
          title="Bridge in"
          hint="Sepolia → Stellar"
        />
        <p className="mb-5 mt-1 text-sm text-zinc-500">
          Lock ETH or test-USDC on Sepolia; a shielded note is minted on Stellar after the light
          client proves the lock.
        </p>
        <div className="space-y-4">
          <Field label="Token">
            <Select
              value={tokenSym}
              onChange={(e) => setTokenSym(e.target.value as BridgeTokenSymbol)}
              options={BRIDGE_TOKEN_OPTIONS}
              disabled={status === 'running'}
            />
          </Field>
          <Field label="Amount" hint={`Locked on Sepolia as ${token.symbol}; minted as ${token.assetCode}.`}>
            <TextInput
              mono
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={status === 'running'}
            />
          </Field>

          {!USE_MOCK_BRIDGE && !BRIDGE_CONFIGURED && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300">
              Live bridge addresses are not configured. Set <span className="font-mono">VITE_L1_BRIDGE_ADDRESS</span>,{' '}
              <span className="font-mono">VITE_ETH_LIGHT_CLIENT</span> and{' '}
              <span className="font-mono">VITE_WRAITH_BRIDGE</span>, or run with{' '}
              <span className="font-mono">VITE_USE_MOCK_BRIDGE=true</span> to preview the flow.
            </p>
          )}
          {!USE_MOCK_BRIDGE && BRIDGE_CONFIGURED && !liveReady && (
            <p className="text-xs text-zinc-500">Connect MetaMask on Sepolia to lock.</p>
          )}

          <Button className="w-full" disabled={!canStart} loading={status === 'running'} onClick={() => void run()}>
            {USE_MOCK_BRIDGE ? 'Bridge in (mock)' : 'Lock on Sepolia'}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <SectionHeading title="Cross-chain progress" hint={USE_MOCK_BRIDGE ? 'mock' : 'live'} />
        {!showTracker ? (
          <p className="py-10 text-center text-sm text-zinc-600">
            Start a bridge-in to watch the lock → header → inclusion → mint pipeline.
          </p>
        ) : (
          <>
            <ol className="mt-4 space-y-4">
              {IN_STEPS.map((label, i) => (
                <StepRow
                  key={label}
                  label={label}
                  state={stepStateFor(i, step, status)}
                  detail={
                    i === 0 && l1Hash ? (
                      USE_MOCK_BRIDGE ? (
                        <span className="font-mono">{l1Hash}</span>
                      ) : (
                        <TxLink href={sepoliaTxUrl(l1Hash)} label={truncateKey(l1Hash, 8, 6)} />
                      )
                    ) : i === 3 && status === 'done' && WRAITH_BRIDGE_ID && !USE_MOCK_BRIDGE ? (
                      <TxLink href={stellarContractUrl(WRAITH_BRIDGE_ID)} label="WraithBridge" />
                    ) : undefined
                  }
                />
              ))}
            </ol>
            {status === 'error' && error && <p className="mt-4 text-sm text-red-300">{error}</p>}
            {status === 'done' && (
              <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300">
                <CheckIcon className="h-4 w-4" /> Shielded {token.assetCode} now visible in Portfolio.
              </p>
            )}
            {(status === 'done' || status === 'error') && (
              <Button variant="outline" className="mt-5 w-full" onClick={reset}>
                Bridge another
              </Button>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bridge Out (Stellar -> Sepolia)
// ---------------------------------------------------------------------------

const OUT_STEPS = [
  'Generate withdraw proof',
  'bridge_out on Stellar (burn note)',
  'Unlock authorized (governor)',
  'Released on Sepolia',
]

function BridgeOut() {
  const { sdk, balances, refreshBalances } = useWraith()
  const bridged = balances.filter((b) => BRIDGED_ASSET_CODES.includes(b.asset))

  const [asset, setAsset] = useState<AssetCode | ''>('')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')

  const [status, setStatus] = useState<FlowStatus>('idle')
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const options = bridged.map((b) => ({ value: b.asset, label: `${b.asset} · ${b.amount}` }))
  const selected = asset || bridged[0]?.asset || ''
  const recipientValid = isEvmAddress(recipient)
  const valid =
    Boolean(selected) && isPositiveAmount(amount) && recipientValid && status !== 'running'

  function debitBalance(code: AssetCode, amt: string) {
    if (USE_MOCK) {
      // Mock SDK tracks its own balances.
      void sdk.withdraw({ asset: code, amount: amt, recipient })
    } else {
      // Real SDK reads note-store; spend whole bridged notes covering the amount.
      let remaining = (() => {
        try {
          const dec = code === 'bETH' ? 18 : 6 // mirror config decimals
          return toBaseUnits(amt, dec)
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
  }

  async function run() {
    setError(null)
    setStatus('running')
    setStep(0)
    try {
      if (!USE_MOCK_BRIDGE) {
        throw new Error(
          'Live bridge-out needs the deployed WraithBridge contract + the in-browser withdraw prover (VITE_ENABLE_WITHDRAW). Use mock mode (VITE_USE_MOCK_BRIDGE=true) to preview the burn → unlock flow.',
        )
      }
      await wait(1100) // generate withdraw proof
      setStep(1)
      await wait(1000) // bridge_out burn
      setStep(2)
      await wait(1100) // unlock authorized
      setStep(3)
      await wait(900) // released on L1
      debitBalance(selected as AssetCode, amount)
      await refreshBalances()
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bridge out failed.')
      setStatus('error')
    }
  }

  function reset() {
    setStatus('idle')
    setStep(0)
    setError(null)
    setAmount('')
    setRecipient('')
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="p-6">
        <SectionHeading
          icon={<ArrowUpIcon className="h-4 w-4" />}
          title="Bridge out"
          hint="Stellar → Sepolia"
        />
        <p className="mb-5 mt-1 text-sm text-zinc-500">
          Burn a bridged note with a ZK proof; the escrow is released to your Ethereum address.
        </p>

        {bridged.length === 0 ? (
          <p className="rounded-xl border border-ink-700 bg-ink-900/60 px-3.5 py-6 text-center text-sm text-zinc-500">
            No bridged notes yet. Bridge in first.
          </p>
        ) : (
          <div className="space-y-4">
            <Field label="Bridged note">
              <Select
                value={selected}
                onChange={(e) => setAsset(e.target.value as AssetCode)}
                options={options}
                disabled={status === 'running'}
              />
            </Field>
            <Field label="Amount">
              <TextInput
                mono
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={status === 'running'}
              />
            </Field>
            <Field
              label="Ethereum recipient"
              hint={
                recipient && !recipientValid ? (
                  <span className="text-amber-400">Enter a valid 0x… address.</span>
                ) : (
                  'Sepolia address that receives the released funds.'
                )
              }
            >
              <TextInput
                mono
                placeholder="0x…"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={status === 'running'}
              />
            </Field>
            <Button className="w-full" disabled={!valid} loading={status === 'running'} onClick={() => void run()}>
              {USE_MOCK_BRIDGE ? 'Bridge out (mock)' : 'Prove + bridge out'}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <SectionHeading title="Settlement progress" hint={USE_MOCK_BRIDGE ? 'mock' : 'live'} />
        {status === 'idle' ? (
          <p className="py-10 text-center text-sm text-zinc-600">
            Start a bridge-out to watch the burn → unlock pipeline.
          </p>
        ) : (
          <>
            <ol className="mt-4 space-y-4">
              {OUT_STEPS.map((label, i) => (
                <StepRow key={label} label={label} state={stepStateFor(i, step, status)} />
              ))}
            </ol>
            {status === 'error' && error && <p className="mt-4 text-sm text-red-300">{error}</p>}
            {status === 'done' && (
              <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300">
                <CheckIcon className="h-4 w-4" /> Released to {truncateKey(recipient, 6, 6)} on Sepolia.
              </p>
            )}
            {(status === 'done' || status === 'error') && (
              <Button variant="outline" className="mt-5 w-full" onClick={reset}>
                Done
              </Button>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bridge tab
// ---------------------------------------------------------------------------

export function Bridge() {
  const [mode, setMode] = useState<'in' | 'out'>('in')

  return (
    <div className="space-y-6">
      <PageIntro
        title="Bridge"
        subtitle="Trust-minimized cross-chain bridge — Ethereum Sepolia ↔ Stellar shielded pool."
      />

      <LightClientChip />
      <Connections />

      <ToggleGroup
        value={mode}
        onChange={setMode}
        options={[
          { value: 'in', label: 'Bridge in' },
          { value: 'out', label: 'Bridge out' },
        ]}
      />

      {mode === 'in' ? <BridgeIn /> : <BridgeOut />}
    </div>
  )
}
