import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Bridge } from './components/Bridge'
import { Portfolio } from './components/Portfolio'
import { Pay } from './components/Pay'
import { Swap } from './components/Swap'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/bridge" replace />} />
        <Route path="/bridge" element={<Bridge />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/pay" element={<Pay />} />
        <Route path="/swap" element={<Swap />} />
        <Route path="*" element={<Navigate to="/bridge" replace />} />
      </Routes>
    </Layout>
  )
}
