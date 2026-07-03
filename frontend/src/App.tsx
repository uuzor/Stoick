import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Wallet } from './components/Wallet'
import { Faucet } from './components/Faucet'
import { Landing } from './components/Landing'
import { BrandCanvas } from './components/BrandCanvas'

// Routes: the moody monopo landing at "/", the shielded film at "/app" (the masthead
// IS the app; Cross / Send / Book / Cipher are editorial acts you scroll), and the
// testnet faucet at "/faucet". Both app surfaces share the one BrandCanvas world.

function LandingRoute() {
  const navigate = useNavigate()
  return <Landing onEnter={() => navigate('/app')} />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route
        path="/app"
        element={
          <>
            <BrandCanvas />
            <Wallet />
          </>
        }
      />
      <Route
        path="/faucet"
        element={
          <>
            <BrandCanvas />
            <Faucet />
          </>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
