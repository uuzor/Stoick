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
        <div className="mb-5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.32em] text-zinc-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-300" />
          Full privacy on Stellar
        </div>

        <h1
          className="font-display text-6xl font-semibold tracking-tight text-zinc-100 sm:text-8xl"
          style={{ textShadow: '0 0 40px rgba(240,240,240,0.28), 0 2px 22px rgba(0,0,0,0.65)' }}
        >
          WRAITH
        </h1>

        <p className="mt-5 max-w-md text-sm leading-relaxed text-zinc-300/90">
          Private by proof. Bridge, hold, pay and trade —{' '}
          <span className="text-zinc-100">shielded, and verified on-chain.</span>
        </p>

        <button onClick={onEnter} className="btn btn-primary mt-9 px-9 text-sm tracking-wide">
          Enter
        </button>

        <div className="mt-4 font-mono text-[11px] text-zinc-600">testnet · UltraHonk + Signal</div>
      </div>
    </div>
  )
}
