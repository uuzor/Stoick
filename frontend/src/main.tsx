import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { WraithProvider } from './hooks/useWraith'
import './index.css'

// @stellar/stellar-sdk (stellar-base) relies on a global Buffer in the browser.
if (!globalThis.Buffer) globalThis.Buffer = Buffer

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <WraithProvider>
        <App />
      </WraithProvider>
    </HashRouter>
  </StrictMode>,
)
