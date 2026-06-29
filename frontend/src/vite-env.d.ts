/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Use the offline MockWraithSdk instead of the live testnet client. */
  readonly VITE_USE_MOCK?: string
  /** Enable the experimental in-browser withdraw prover (heavy). */
  readonly VITE_ENABLE_WITHDRAW?: string
  /** Overrides for the live deployment (default to deployments.json / testnet). */
  readonly VITE_WRAITH_POOL?: string
  readonly VITE_NATIVE_SAC?: string
  readonly VITE_USDC_SAC?: string
  readonly VITE_SOROBAN_RPC_URL?: string
  readonly VITE_NETWORK_PASSPHRASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
