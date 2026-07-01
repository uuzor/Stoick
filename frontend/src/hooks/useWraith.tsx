import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { deriveOwnerKey, deriveViewingKey, fieldToHex } from '@wraith/sdk'
import { createWraithSdk } from '../lib/wraith-sdk'
import type { OpenOrder, ShieldedBalance, WraithSdk } from '../lib/wraith-sdk'
import { USE_MOCK } from '../lib/config'
import {
  clearActiveIdentity,
  getSpendingKey,
  hasSpendingKey,
  randomSpendingKey,
  setActiveAddress,
  setSpendingKey,
} from '../lib/note-store'
import { resolveShieldedIdentity } from '../lib/shielded-identity'
import { deriveEncKeypair, encodeReceiveCode, type EncKeypair } from '../lib/note-crypto'
import { scanIncomingNotes } from '../lib/note-scanner'
import { useWallet } from './useWallet'

interface WraithContextValue {
  sdk: WraithSdk
  balances: ShieldedBalance[]
  orders: OpenOrder[]
  loadingBalances: boolean
  loadingOrders: boolean
  /** The wallet's shareable Receive code (owner key + encryption key), or null until derived. */
  receiveCode: string | null
  /** True once the shielded spending key is ready (deposits/withdraws/sends can run). */
  identityReady: boolean
  refreshBalances: () => Promise<void>
  refreshOrders: () => Promise<void>
}

const WraithContext = createContext<WraithContextValue | null>(null)

/**
 * Provides the app-wide Wraith SDK client plus cached shielded balances and open orders.
 * The shielded identity (spending + viewing keys) is derived from the connected Stellar
 * wallet, and this is the only place that constructs the SDK, drives that derivation, and
 * scans for incoming notes (note discovery).
 */
export function WraithProvider({ children }: { children: ReactNode }) {
  const sdkRef = useRef<WraithSdk>(createWraithSdk())
  const sdk = sdkRef.current
  const { address, status } = useWallet()

  const [balances, setBalances] = useState<ShieldedBalance[]>([])
  const [orders, setOrders] = useState<OpenOrder[]>([])
  const [loadingBalances, setLoadingBalances] = useState(true)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [receiveCode, setReceiveCode] = useState<string | null>(null)
  const [identityReady, setIdentityReady] = useState(false)

  // Kept in refs for the background scanner (avoids re-subscribing on every render).
  const encRef = useRef<EncKeypair | null>(null)
  const ownerHexRef = useRef<string | null>(null)

  const refreshBalances = useCallback(async () => {
    setLoadingBalances(true)
    try {
      setBalances(await sdk.getShieldedBalances())
    } finally {
      setLoadingBalances(false)
    }
  }, [sdk])

  const refreshOrders = useCallback(async () => {
    setLoadingOrders(true)
    try {
      setOrders(await sdk.getOpenOrders())
    } finally {
      setLoadingOrders(false)
    }
  }, [sdk])

  useEffect(() => {
    void refreshOrders()
  }, [refreshOrders])

  // Bind the shielded identity to the connected wallet: derive keys, expose the receive
  // code, scan for incoming notes, and load the balance. Clear everything on disconnect.
  useEffect(() => {
    let cancelled = false

    function applyIdentity(key: bigint) {
      const ownerKey = deriveOwnerKey(key)
      const enc = deriveEncKeypair(deriveViewingKey(key))
      encRef.current = enc
      ownerHexRef.current = fieldToHex(ownerKey)
      setReceiveCode(encodeReceiveCode(ownerKey, enc.pub))
    }

    async function sync() {
      if (USE_MOCK) {
        setActiveAddress('mock')
        if (!hasSpendingKey()) setSpendingKey(randomSpendingKey())
        if (cancelled) return
        applyIdentity(getSpendingKey())
        setIdentityReady(true)
        await refreshBalances()
        return
      }

      if (status !== 'connected' || !address) {
        clearActiveIdentity()
        encRef.current = null
        ownerHexRef.current = null
        setIdentityReady(false)
        setReceiveCode(null)
        setBalances([])
        setLoadingBalances(false)
        return
      }

      setIdentityReady(false)
      try {
        const { key } = await resolveShieldedIdentity(address)
        if (cancelled) return
        applyIdentity(key)
        setIdentityReady(true)
        // Discover any notes already sent to us, then load the balance.
        const found = await scanIncomingNotes(encRef.current!, ownerHexRef.current!).catch(() => 0)
        if (cancelled) return
        await refreshBalances()
        if (found > 0 && !cancelled) await refreshBalances()
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to derive the shielded identity', err)
          setIdentityReady(false)
        }
      }
    }

    void sync()
    return () => {
      cancelled = true
    }
  }, [address, status, refreshBalances])

  // Poll for incoming notes while connected, so payments arrive without a manual refresh.
  useEffect(() => {
    if (USE_MOCK || !identityReady) return
    const id = setInterval(() => {
      const enc = encRef.current
      const owner = ownerHexRef.current
      if (!enc || !owner) return
      void scanIncomingNotes(enc, owner)
        .then((n) => {
          if (n > 0) void refreshBalances()
        })
        .catch(() => undefined)
    }, 15_000)
    return () => clearInterval(id)
  }, [identityReady, address, refreshBalances])

  const value = useMemo<WraithContextValue>(
    () => ({
      sdk,
      balances,
      orders,
      loadingBalances,
      loadingOrders,
      receiveCode,
      identityReady,
      refreshBalances,
      refreshOrders,
    }),
    [sdk, balances, orders, loadingBalances, loadingOrders, receiveCode, identityReady, refreshBalances, refreshOrders],
  )

  return <WraithContext.Provider value={value}>{children}</WraithContext.Provider>
}

export function useWraith(): WraithContextValue {
  const ctx = useContext(WraithContext)
  if (!ctx) throw new Error('useWraith must be used within a WraithProvider')
  return ctx
}
