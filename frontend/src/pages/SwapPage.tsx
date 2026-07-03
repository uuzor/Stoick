import { Act } from '../components/Act'
import { Swap } from '../components/Swap'
import { USE_MOCK } from '../lib/config'
import { matchingEnabled } from '../lib/matcher-client'

/** Act 03 honesty gate — shown live when no matcher operator is connected. */
function MatcherNote() {
  return (
    <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-300">
      <span className="font-mono uppercase tracking-[0.14em]">Operator</span> — orders place and cancel on-chain now; live
      matching connects when a matcher operator is running. Fills stay ZK-enforced at the midpoint, the operator only
      settles.
    </div>
  )
}

export function SwapPage() {
  return (
    <Act
      no="Act 03"
      id="act-book"
      title="The sealed book"
      standfirst="A dark pool where orders stay sealed until they match at the midpoint — so there is nothing to front-run."
      coords={['Sealed orders', 'Midpoint match']}
    >
      {!USE_MOCK && !matchingEnabled() && <MatcherNote />}
      <Swap embedded />
    </Act>
  )
}

export default SwapPage
