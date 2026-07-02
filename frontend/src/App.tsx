import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Wallet } from './components/Wallet'
import { Faucet } from './components/Faucet'
import { Landing } from './components/Landing'
import DitherFluid from './components/DitherFluid'

// Routes: the moody VHS landing at "/", the shielded wallet at "/app" (Portfolio IS the
// app; Deposit / Send / Swap / Receive open as sheets), and the testnet faucet at "/faucet".

function LandingRoute() {
  const navigate = useNavigate()
  return <Landing onEnter={() => navigate('/app')} />
}

/** Ambient dithered-fluid backdrop — cold monochrome, dense but dimmed behind the app surfaces. */
function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 bg-[#060709]">
      <DitherFluid
        bgColor="#060709"
        inkColor="#C7CDD6"
        scale={5.0}
        speed={0.32}
        density={1.0}
        contrast={1.05}
        ditherScale={1.5}
        ribbon={0.82}
        maxCoverage={0.85}
        flowAngle={38}
        quality="medium"
      />
      <div className="absolute inset-0 bg-[#060709]/55" />
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
