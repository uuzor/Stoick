import { useCallback, useEffect, useState } from 'react'
import {
  getAddress,
  getNetwork,
  isAllowed,
  isConnected,
  requestAccess,
} from '@stellar/freighter-api'

export type WalletStatus =
  | 'checking' // probing for the extension / existing session
  | 'not-installed' // Freighter is not available in this browser
  | 'disconnected' // installed, but no approved account yet
  | 'connecting' // awaiting the user's approval in the popup
  | 'connected'

export interface WalletState {
  status: WalletStatus
  address: string | null
  /** Network reported by Freighter, e.g. "TESTNET" / "PUBLIC". */
  network: string | null
  /** True only when Freighter is pointed at Stellar Testnet. */
  isTestnet: boolean
  installed: boolean
  error: string | null
  connect: () => Promise<void>
  disconnect: () => void
}

const TESTNET = 'TESTNET'
export const FREIGHTER_INSTALL_URL = 'https://www.freighter.app/'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Freighter wallet integration. Drives the Connect button: detects whether the
 * extension is installed, requests access, reads the active public key, and
 * surfaces whether the user is on Testnet. Degrades gracefully (install prompt)
 * when Freighter is absent.
 */
export function useWallet(): WalletState {
  const [status, setStatus] = useState<WalletStatus>('checking')
  const [address, setAddress] = useState<string | null>(null)
  const [network, setNetwork] = useState<string | null>(null)
  const [installed, setInstalled] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadNetwork = useCallback(async () => {
    try {
      const result = await getNetwork()
      if (!result.error) setNetwork(result.network)
    } catch {
      setNetwork(null)
    }
  }, [])

  // On mount: probe for the extension and any previously approved session.
  useEffect(() => {
    let cancelled = false
    async function probe() {
      try {
        const conn = await isConnected()
        const present = !conn.error && conn.isConnected
        if (cancelled) return
        setInstalled(present)
        if (!present) {
          setStatus('not-installed')
          return
        }
        const allowed = await isAllowed()
        if (!allowed.error && allowed.isAllowed) {
          const addr = await getAddress()
          if (!cancelled && !addr.error && addr.address) {
            setAddress(addr.address)
            await loadNetwork()
            if (!cancelled) setStatus('connected')
            return
          }
        }
        if (!cancelled) setStatus('disconnected')
      } catch {
        if (!cancelled) {
          setInstalled(false)
          setStatus('not-installed')
        }
      }
    }
    void probe()
    return () => {
      cancelled = true
    }
  }, [loadNetwork])

  const connect = useCallback(async () => {
    setError(null)
    try {
      const conn = await isConnected()
      if (conn.error || !conn.isConnected) {
        setInstalled(false)
        setStatus('not-installed')
        setError('Freighter is not installed.')
        return
      }
      setInstalled(true)
      setStatus('connecting')
      const access = await requestAccess()
      if (access.error || !access.address) {
        setStatus('disconnected')
        setError(access.error?.message ?? 'Connection request was rejected.')
        return
      }
      setAddress(access.address)
      await loadNetwork()
      setStatus('connected')
    } catch (err) {
      setStatus('disconnected')
      setError(errorMessage(err, 'Could not connect to Freighter.'))
    }
  }, [loadNetwork])

  const disconnect = useCallback(() => {
    // Freighter exposes no programmatic disconnect; we clear local UI state.
    setAddress(null)
    setNetwork(null)
    setError(null)
    setStatus('disconnected')
  }, [])

  return {
    status,
    address,
    network,
    isTestnet: network === TESTNET,
    installed,
    error,
    connect,
    disconnect,
  }
}
