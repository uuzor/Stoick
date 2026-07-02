import FluidVolume from './FluidVolume'
import ScrambleCycle from './ScrambleCycle'

const ROTATING = ['shielded', 'unlinkable', 'verified', 'private', 'yours']

const STROKE = 'rgba(239,233,220,0.22)'

/** Two large overlapping circles + three skewed lines + position labels — the
 *  coords background of the monopo.nyc intro, in Wraith's own words. */
function CoordsBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        className="absolute left-1/2 top-[64%]"
        style={{ width: 'min(150vh, 150vw)', height: 'min(150vh, 150vw)', transform: 'translate(-50%, -50%)' }}
        viewBox="0 0 1222 1222"
        fill="none"
        aria-hidden
      >
        <circle cx="611" cy="611" r="500" stroke={STROKE} strokeWidth="1.2" transform="translate(-6 0)" />
        <circle cx="611" cy="611" r="500" stroke={STROKE} strokeWidth="1.2" transform="translate(6 0)" />
      </svg>

      {[-15, 1, 7.6].map((deg, i) => (
        <div
          key={i}
          className="absolute left-[-25%] top-[64%] h-px w-[150%]"
          style={{ background: STROKE, transform: `translateY(-50%) rotate(${deg}deg)`, transformOrigin: 'center' }}
        />
      ))}

      <ul className="absolute inset-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[#efe9dc]/55">
        <li className="absolute left-[5%] top-[45%]">
          <span className="block text-[#efe9dc]/80">Testnet</span>
          <span className="block">[ Stellar · SDF Horizon ]</span>
        </li>
        <li className="absolute right-[5%] top-[38%] text-right">
          <span className="block text-[#efe9dc]/80">Proof</span>
          <span className="block">[ Groth16 · BN254 ]</span>
        </li>
        <li className="absolute bottom-[16%] left-1/2 -translate-x-1/2 text-center">
          <span className="block text-[#efe9dc]/80">Shielded</span>
          <span className="block">[ Poseidon · Merkle ]</span>
        </li>
      </ul>
    </div>
  )
}

function Word({ children }: { children: string }) {
  return <span className="inline-block">{children}</span>
}

export function Landing({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="relative w-full bg-[#211b12] text-[#efe9dc]">
      <section className="relative min-h-screen w-full overflow-hidden">
      {/* Backdrop — monopo.nyc volumetric raymarch (flowing caustic liquid).
          Grain is a separate static overlay; the field's own alpha bleeds the
          bottom edge into the footer cream. */}
      <div className="absolute inset-0">
        <FluidVolume background="#f4efe4" quality="high" />
      </div>

      {/* Static film grain — fixed noise, does not shimmer. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.45 0.45 0.45 0 -0.4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")",
          backgroundSize: '90px 90px',
          opacity: 0.6,
        }}
      />

      <CoordsBackground />

      {/* Keep the upper half a touch darker for the white type. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgba(20,16,9,0.55), rgba(20,16,9,0.12) 42%, transparent 70%)' }}
      />

      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-20 border-b border-[#efe9dc]/15">
        <div className="flex items-center justify-between px-8 py-5">
          <a href="#/" className="font-display text-sm font-semibold tracking-tight">
            wraith <span className="align-super font-mono text-[10px] tracking-[0.2em] text-[#efe9dc]/60">ZK</span>
          </a>
          <nav className="flex items-center gap-8 font-mono text-[11px] uppercase tracking-[0.18em]">
            <a href="#/faucet" className="text-[#efe9dc]/70 transition hover:text-[#efe9dc]">
              Faucet
            </a>
            <button onClick={onEnter} className="text-[#efe9dc]/70 transition hover:text-[#efe9dc]">
              Enter →
            </button>
          </nav>
        </div>
      </header>

      {/* Hero — two fixed word-lines + one rotating, scrambling line. */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <h1
          className="text-center font-display font-medium uppercase leading-[0.98] tracking-[-0.04em] text-[#f6f1e6]"
          style={{ fontSize: 'clamp(2.6rem, 7.4vw, 5.75rem)', textShadow: '0 2px 30px rgba(20,16,9,0.45)' }}
        >
          <span className="flex flex-wrap justify-center gap-x-[0.26em]">
            <Word>private</Word>
            <Word>money</Word>
          </span>
          <span className="flex flex-wrap justify-center gap-x-[0.26em]">
            <Word>that</Word>
            <Word>stays</Word>
          </span>
          <span className="block">
            <ScrambleCycle words={ROTATING} duration={900} hold={2000} />
          </span>
        </h1>

        <span className="mt-10 font-mono text-[11px] uppercase tracking-[0.3em] text-[#efe9dc]/55">scroll</span>
      </div>
      </section>

      <footer className="bg-[#f4efe4] text-[#1b1610]">
        <div className="mx-auto max-w-6xl px-8 py-24">
          <div className="flex flex-col gap-10 border-b border-[#1b1610]/15 pb-16 md:flex-row md:items-end md:justify-between">
            <h2
              className="max-w-xl font-display font-medium leading-[1.02] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(1.9rem, 4vw, 3.25rem)' }}
            >
              Money that stays yours — shielded, private, verified on a public chain.
            </h2>
            <button
              onClick={onEnter}
              className="shrink-0 rounded-full bg-[#1b1610] px-8 py-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#f4efe4] transition hover:bg-[#3b3226]"
            >
              Enter app →
            </button>
          </div>

          <div className="mt-16 grid grid-cols-2 gap-10 font-mono text-[12px] uppercase tracking-[0.12em] md:grid-cols-4">
            <div>
              <div className="mb-4 text-[#1b1610]/45">Product</div>
              <ul className="space-y-2.5">
                <li><a href="#/app" className="transition hover:opacity-60">Portfolio</a></li>
                <li><a href="#/app" className="transition hover:opacity-60">Bridge</a></li>
                <li><a href="#/app" className="transition hover:opacity-60">Pay</a></li>
                <li><a href="#/app" className="transition hover:opacity-60">Swap</a></li>
              </ul>
            </div>
            <div>
              <div className="mb-4 text-[#1b1610]/45">Network</div>
              <ul className="space-y-2.5">
                <li><a href="#/faucet" className="transition hover:opacity-60">Faucet</a></li>
                <li><span className="text-[#1b1610]/70">Stellar testnet</span></li>
                <li><span className="text-[#1b1610]/70">Soroban</span></li>
              </ul>
            </div>
            <div>
              <div className="mb-4 text-[#1b1610]/45">Privacy</div>
              <ul className="space-y-2.5">
                <li><span className="text-[#1b1610]/70">Zero-knowledge</span></li>
                <li><span className="text-[#1b1610]/70">Groth16 · BN254</span></li>
                <li><span className="text-[#1b1610]/70">Poseidon · Merkle</span></li>
              </ul>
            </div>
            <div>
              <div className="mb-4 text-[#1b1610]/45">Wraith</div>
              <ul className="space-y-2.5">
                <li><span className="text-[#1b1610]/70">Private by default</span></li>
                <li><a href="#/" className="transition hover:opacity-60">Home</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-20 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-[#1b1610]/55">
            <span>© Wraith 2026</span>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="transition hover:text-[#1b1610]"
            >
              Top ↑
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
