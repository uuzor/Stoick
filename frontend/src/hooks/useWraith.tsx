import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createWraithSdk } from '../lib/wraith-sdk'
import type { OpenOrder, ShieldedBalance, WraithSdk } from '../lib/wraith-sdk'

interface WraithContextValue {
  sdk: WraithSdk
  balances: ShieldedBalance[]
  orders: OpenOrder[]
  loadingBalances: boolean
  loadingOrders: boolean
  refreshBalances: () => Promise<void>
  refreshOrders: () => Promise<void>
}

const WraithContext = createContext<WraithContextValue | null>(null)

/**
 * Provides the app-wide Wraith SDK client plus cached shielded balances and
 * open orders. Mutations call the SDK then `refresh*()` so every tab stays in
 * sync. This is the only place that constructs the SDK.
 */
export function WraithProvider({ children }: { children: ReactNode }) {
  const sdkRef = useRef<WraithSdk>(createWraithSdk())
  const sdk = sdkRef.current

  const [balances, setBalances] = useState<ShieldedBalance[]>([])
  const [orders, setOrders] = useState<OpenOrder[]>([])
  const [loadingBalances, setLoadingBalances] = useState(true)
  const [loadingOrders, setLoadingOrders] = useState(true)

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
    void refreshBalances()
    void refreshOrders()
  }, [refreshBalances, refreshOrders])

  const value = useMemo<WraithContextValue>(
    () => ({
      sdk,
      balances,
      orders,
      loadingBalances,
      loadingOrders,
      refreshBalances,
      refreshOrders,
    }),
    [sdk, balances, orders, loadingBalances, loadingOrders, refreshBalances, refreshOrders],
  )

  return <WraithContext.Provider value={value}>{children}</WraithContext.Provider>
}

export function useWraith(): WraithContextValue {
  const ctx = useContext(WraithContext)
  if (!ctx) throw new Error('useWraith must be used within a WraithProvider')
  return ctx
}
