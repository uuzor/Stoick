import type { ProofFlow } from '../hooks/useProofFlow'
import { cx } from '../lib/cx'
import { Button, Card, CheckIcon, ShieldIcon, Spinner, XIcon } from './ui'

type StepState = 'done' | 'active' | 'pending' | 'error'

function StepRow({ label, state }: { label: string; state: StepState }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cx(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
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
      <span
        className={cx(
          'text-sm transition-colors',
          state === 'pending' ? 'text-zinc-600' : state === 'error' ? 'text-red-300' : 'text-zinc-200',
        )}
      >
        {label}
      </span>
    </li>
  )
}

/**
 * Reusable proof-progress overlay. Renders the four-stage proof lifecycle
 * (witness → proof → submit → confirmed) from a `useProofFlow` instance.
 * Wired into the Pay and Swap submit flows.
 */
export function ProofProgress({
  flow,
  title = 'Generating proof',
  onClose,
}: {
  flow: ProofFlow
  title?: string
  onClose: () => void
}) {
  if (flow.status === 'idle') return null

  const done = flow.status === 'done'
  const errored = flow.status === 'error'

  function stepState(index: number): StepState {
    if (errored && index === flow.step) return 'error'
    if (done || index < flow.step) return 'done'
    if (index === flow.step) return 'active'
    return 'pending'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 animate-fade-in">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-3">
          <span
            className={cx(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              errored ? 'bg-red-500/15 text-red-300' : 'bg-spectral/15 text-spectral-soft',
            )}
          >
            {errored ? <XIcon className="h-4 w-4" /> : <ShieldIcon className="h-5 w-5" />}
          </span>
          <div>
            <div className="panel-title">{done ? 'Confirmed' : errored ? 'Failed' : title}</div>
            <div className="text-xs text-zinc-500">Zero-knowledge proof · Stellar Testnet</div>
          </div>
        </div>

        <ol className="space-y-3">
          {flow.steps.map((label, index) => (
            <StepRow key={label} label={label} state={stepState(index)} />
          ))}
        </ol>

        {errored && flow.error && <p className="mt-4 text-sm text-red-300">{flow.error}</p>}

        {(done || errored) && (
          <Button className="mt-6 w-full" variant={errored ? 'outline' : 'primary'} onClick={onClose}>
            {errored ? 'Close' : 'Done'}
          </Button>
        )}
      </Card>
    </div>
  )
}
