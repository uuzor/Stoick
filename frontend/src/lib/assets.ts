import type { AssetCode } from './wraith-sdk'

export interface AssetMeta {
  code: AssetCode
  name: string
  /** Mock spot price in USD, used only for portfolio estimates. */
  priceUsd: number
  /** Tailwind classes for the asset avatar tint. */
  avatarClass: string
}

export const ASSETS: Record<AssetCode, AssetMeta> = {
  XLM: {
    code: 'XLM',
    name: 'Stellar Lumens',
    priceUsd: 0.39,
    avatarClass: 'bg-spectral/15 text-spectral-soft',
  },
  USDC: {
    code: 'USDC',
    name: 'USD Coin',
    priceUsd: 1,
    avatarClass: 'bg-sky-500/15 text-sky-300',
  },
  bETH: {
    code: 'bETH',
    name: 'Bridged ETH (Sepolia)',
    priceUsd: 3500,
    avatarClass: 'bg-indigo-500/15 text-indigo-300',
  },
  bUSDC: {
    code: 'bUSDC',
    name: 'Bridged USDC (Sepolia)',
    priceUsd: 1,
    avatarClass: 'bg-teal-500/15 text-teal-300',
  },
}

/** Native Stellar shielded assets — the only ones offered in Pay / Swap / Bridge deposit. */
export const ASSET_CODES: AssetCode[] = ['XLM', 'USDC']

/** Bridged (cross-chain) assets — minted by the Bridge tab, shown in Portfolio. */
export const BRIDGED_ASSET_CODES: AssetCode[] = ['bETH', 'bUSDC']

export const ASSET_OPTIONS = ASSET_CODES.map((code) => ({
  value: code,
  label: `${code} — ${ASSETS[code].name}`,
}))
