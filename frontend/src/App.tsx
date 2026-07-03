import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AppShell, PortfolioView, BridgeView, PayView, SwapView } from './components/Wallet'
import { Faucet } from './components/Faucet'
import { Landing } from './components/Landing'
import { BrandCanvas } from './components/BrandCanvas'

// Routes: the moody monopo landing at "/", the shielded app under "/app" — each act
// is now its own route (portfolio / bridge / pay / swap) sharing one AppShell world —
// and the testnet faucet at "/faucet".

function LandingRoute() {
  const navigate = useNavigate()
  return <Landing onEnter={() => navigate('/app')} />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Navigate to="/app/portfolio" replace />} />
        <Route path="portfolio" element={<PortfolioView />} />
        <Route path="bridge" element={<BridgeView />} />
        <Route path="pay" element={<PayView />} />
        <Route path="swap" element={<SwapView />} />
      </Route>
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
