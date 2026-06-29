/** Formatting and validation helpers for the Wraith UI. */

/** Shorten a long key/hash to `ABCDE…WXYZ`. */
export function truncateKey(key: string, lead = 5, tail = 4): string {
  if (key.length <= lead + tail + 1) return key
  return `${key.slice(0, lead)}…${key.slice(-tail)}`
}

const amountFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 7 })

/** Format a token amount with thousands separators, trimming trailing zeros. */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return amountFmt.format(value)
}

const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

export function formatUsd(value: number): string {
  return usdFmt.format(Number.isFinite(value) ? value : 0)
}

/** Parse a user-entered decimal string into a number (NaN if invalid). */
export function parseAmount(input: string): number {
  if (!input.trim()) return NaN
  const n = Number(input.replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : NaN
}

export function isPositiveAmount(input: string): boolean {
  const n = parseAmount(input)
  return Number.isFinite(n) && n > 0
}

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/

/** Lightweight check for a classic Stellar public key (G… base32, 56 chars). */
export function isValidStellarAddress(addr: string): boolean {
  return STELLAR_ADDRESS.test(addr.trim())
}
