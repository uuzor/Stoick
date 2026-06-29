/**
 * Live deployment configuration for the Wraith frontend.
 *
 * Source of truth: `deployments.json` at the repo root (testnet). The values are inlined
 * here (a typed config) so the app does not need filesystem access outside its own root,
 * and every value can be overridden at build time via `VITE_*` env vars for other
 * networks / private deployments.
 *
 * deployments.json (testnet):
 *   pool        CD7EF4GG32IPVS2PGD2LMXEO3TPEWBZRUCBBSPXQ236CD6TMF5S4UUZR
 *   native SAC  CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
 *   passphrase  "Test SDF Network ; September 2015"
 */
import { assetFromSac, NATIVE_ASSET_ID, type Field } from '@wraith/sdk'
import type { AssetCode } from './wraith-sdk'

function env(key: string, fallback: string): string {
  const v = import.meta.env[key as keyof ImportMetaEnv] as string | undefined
  return v && v.length > 0 ? v : fallback
}

function flag(key: string): boolean {
  const v = import.meta.env[key as keyof ImportMetaEnv] as string | undefined
  return v === 'true' || v === '1'
}

/** WraithPool contract id on the configured network. */
export const POOL_CONTRACT_ID = env(
  'VITE_WRAITH_POOL',
  'CD7EF4GG32IPVS2PGD2LMXEO3TPEWBZRUCBBSPXQ236CD6TMF5S4UUZR',
)

/** Native (XLM) Stellar Asset Contract address. */
export const NATIVE_SAC = env(
  'VITE_NATIVE_SAC',
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
)

/** Soroban RPC endpoint (Testnet by default). */
export const SOROBAN_RPC_URL = env('VITE_SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org')

/** Stellar network passphrase. */
export const NETWORK_PASSPHRASE = env('VITE_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015')

/** When true, the app uses the offline `MockWraithSdk` instead of the live client. */
export const USE_MOCK = flag('VITE_USE_MOCK')

/**
 * When true, the experimental in-browser withdraw prover is enabled (heavy: pulls
 * `@noir-lang/noir_js` + `@aztec/bb.js` WASM and fetches a CRS). Off by default.
 */
export const ENABLE_WITHDRAW = flag('VITE_ENABLE_WITHDRAW')

/** Optional USDC SAC address — not part of the single-asset testnet demo. */
export const USDC_SAC = env('VITE_USDC_SAC', '')

/** Per-asset on-chain config. `assetId` is the in-circuit field id (native XLM = 0). */
export interface AssetConfig {
  code: AssetCode
  /** Field identifier used in notes/commitments. */
  assetId: Field
  /** SAC contract address (StrKey "C…"), or undefined if not deployed on this network. */
  sac: string | undefined
  /** On-chain fixed-point decimals (stroops for XLM = 7). */
  decimals: number
  /** Display price estimate (USD), portfolio only. */
  priceUsd: number
}

export const ASSET_CONFIG: Record<AssetCode, AssetConfig> = {
  XLM: { code: 'XLM', assetId: NATIVE_ASSET_ID, sac: NATIVE_SAC, decimals: 7, priceUsd: 0.39 },
  USDC: {
    code: 'USDC',
    // Derived from the SAC address when configured; otherwise a placeholder id.
    assetId: USDC_SAC ? assetFromSac(USDC_SAC, 'USDC').assetId : 0n,
    sac: USDC_SAC || undefined,
    decimals: 7,
    priceUsd: 1,
  },
}
