import { useCallback, useState } from 'react'

/** The fixed proof lifecycle shown to the user. */
export const PROOF_STEPS = [
  'Generating witness…',
  'Computing proof…',
  'Submitting transaction…',
  'Confirmed',
] as const

export type ProofStatus = 'idle' | 'running' | 'done' | 'error'

export interface ProofFlow {
  status: ProofStatus
  /** Index into PROOF_STEPS of the current step. */
  step: number
  error: string | null
  steps: readonly string[]
  /**
   * Runs the proof animation, invoking `action` during the "Submitting"
   * step. Resolves with the action's result, or null on error.
   */
  run: <T>(action: () => Promise<T>) => Promise<T | null>
  reset: () => void
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Orchestrates the reusable proof-progress UX: witness → proof → submit →
 * confirmed. The witness/proof phases are simulated; the real async work
 * (the SDK call) happens during the "Submitting transaction…" step.
 */
export function useProofFlow(): ProofFlow {
  const [status, setStatus] = useState<ProofStatus>('idle')
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
    setError(null)
    setStatus('running')
    setStep(0)
    await wait(900) // Generating witness…
    setStep(1)
    await wait(1200) // Computing proof…
    setStep(2) // Submitting transaction…
    try {
      const result = await action()
      setStep(3)
      setStatus('done')
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed.')
      setStatus('error')
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setStep(0)
    setError(null)
  }, [])

  return { status, step, error, steps: PROOF_STEPS, run, reset }
}
