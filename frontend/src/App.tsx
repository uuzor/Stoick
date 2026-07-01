import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Wallet } from './components/Wallet'
import { Landing } from './components/Landing'
import LightPillar from './components/LightPillar'

// Two routes: the moody VHS landing at "/", and the shielded wallet at "/app"
// (Portfolio IS the app; Deposit / Send / Swap / Receive open as sheets over it).

function LandingRoute() {
  const navigate = useNavigate()
  return <Landing onEnter={() => navigate('/app')} />
}

function AppRoute() {
  return (
    <>
      {/* Ambient light-pillar backdrop — black & white, subtle, behind the wallet. */}
      <div className="pointer-events-none fixed inset-0 -z-10" style={{ opacity: 0.42 }}>
        <LightPillar
          topColor="#E8E8E6"
          bottomColor="#3C3C3A"
          intensity={1.0}
          rotationSpeed={0.3}
          glowAmount={0.005}
          pillarWidth={3.0}
          pillarHeight={0.4}
          noiseIntensity={0.5}
          mixBlendMode="screen"
          quality="medium"
        />
      </div>
      <Wallet />
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/app" element={<AppRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
