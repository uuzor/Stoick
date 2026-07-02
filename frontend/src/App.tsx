import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Wallet } from './components/Wallet'
import { Faucet } from './components/Faucet'
import { Landing } from './components/Landing'
import LightPillar from './components/LightPillar'

// Routes: the moody VHS landing at "/", the shielded wallet at "/app" (Portfolio IS the
// app; Deposit / Send / Swap / Receive open as sheets), and the testnet faucet at "/faucet".

function LandingRoute() {
  const navigate = useNavigate()
  return <Landing onEnter={() => navigate('/app')} />
}

/** Ambient light-pillar backdrop — black & white, subtle, behind the app surfaces. */
function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10" style={{ opacity: 0.42 }}>
      <LightPillar
        topColor="#000000"
        bottomColor="#797572"
        intensity={1.5}
        rotationSpeed={0.2}
        glowAmount={0.005}
        pillarWidth={2}
        pillarHeight={0.3}
        noiseIntensity={2}
        pillarRotation={270}
        interactive={false}
        mixBlendMode="lighten"
        quality="medium"
      />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route
        path="/app"
        element={
          <>
            <Backdrop />
            <Wallet />
          </>
        }
      />
      <Route
        path="/faucet"
        element={
          <>
            <Backdrop />
            <Faucet />
          </>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
