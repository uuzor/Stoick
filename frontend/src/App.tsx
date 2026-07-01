import { useState } from 'react'
import { Wallet } from './components/Wallet'
import { Landing } from './components/Landing'
import LightPillar from './components/LightPillar'

const ENTERED_KEY = 'wraith:entered'

// Wraith is one surface — a shielded wallet. A moody VHS landing gates it; "Enter"
// drops you into the wallet, which floats over an ambient black-and-white light
// pillar. (Portfolio IS the app; Deposit / Send / Swap / Receive open as sheets.)
export default function App() {
  const [entered, setEntered] = useState(() => {
    try {
      return sessionStorage.getItem(ENTERED_KEY) === '1'
    } catch {
      return false
    }
  })

  if (!entered) {
    return (
      <Landing
        onEnter={() => {
          try {
            sessionStorage.setItem(ENTERED_KEY, '1')
          } catch {
            /* sessionStorage may be unavailable */
          }
          setEntered(true)
        }}
      />
    )
  }

  return (
    <>
      {/* Ambient light-pillar backdrop — black & white, subtle, behind the wallet. */}
      <div className="pointer-events-none fixed inset-0 -z-10" style={{ opacity: 0.42 }}>
        <LightPillar
          topColor="#E8E8E6"
          bottomColor="#3C3C3A"
          intensity={0.9}
          rotationSpeed={0.18}
          glowAmount={0.005}
          pillarWidth={3.0}
          pillarHeight={0.4}
          noiseIntensity={0.35}
          mixBlendMode="screen"
          quality="medium"
        />
      </div>
      <Wallet />
    </>
  )
}
