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
}

export const ASSET_CODES: AssetCode[] = ['XLM', 'USDC']

export const ASSET_OPTIONS = ASSET_CODES.map((code) => ({
  value: code,
  label: `${code} — ${ASSETS[code].name}`,
}))
