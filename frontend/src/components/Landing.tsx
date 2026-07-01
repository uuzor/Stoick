import { Suspense, lazy, useState } from 'react'

// Heavy three.js stack — lazy so it never touches the wallet bundle.
const GlitchStage = lazy(() => import('./GlitchStage'))

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Static, warm-tinted image — the fallback while WebGL loads (or if motion is off). */
function StaticBackdrop() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ink-950">
      <img
        src="/wraith-landing.png"
        alt=""
        className="h-[94%] w-auto object-contain opacity-90 [filter:sepia(0.3)_saturate(1.1)_contrast(1.03)]"
      />
    </div>
  )
}

export function Landing({ onEnter }: { onEnter: () => void }) {
  const [motion] = useState(() => !prefersReducedMotion())

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-ink-950">
      {/* Backdrop */}
      <div className="absolute inset-0">
        {motion ? (
          <Suspense fallback={<StaticBackdrop />}>
            <GlitchStage />
          </Suspense>
        ) : (
          <StaticBackdrop />
        )}
      </div>

      {/* Vignette + bottom gradient for legibility (warm-black) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(65% 55% at 50% 42%, transparent 40%, rgba(15,14,9,0.55) 100%),' +
            'linear-gradient(to bottom, rgba(15,14,9,0.35), transparent 26%, transparent 62%, rgba(15,14,9,0.85))',
        }}
      />

      {/* Hero */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1
          className="font-display text-6xl font-semibold tracking-tight text-zinc-100 sm:text-7xl"
          style={{ textShadow: '0 2px 24px rgba(0,0,0,0.7)' }}
        >
          WRAITH
        </h1>

        <p className="mt-6 max-w-md text-sm leading-relaxed text-zinc-300">
          Bridge, hold, pay, and trade with shielded balances, verified on-chain by
          zero-knowledge proofs.
        </p>

        <button onClick={onEnter} className="btn btn-primary mt-9 px-9 text-sm">
          Enter
        </button>

        <div className="mt-4 font-mono text-xs text-zinc-500">Stellar testnet</div>
      </div>
    </div>
  )
}
