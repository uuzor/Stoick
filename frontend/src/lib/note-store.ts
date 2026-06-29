/**
 * Local wallet persistence for the live Wraith client.
 *
 * A shielded balance note's secret material (spending key, blinding) is the ONLY thing
 * that lets the owner later spend/withdraw it — it lives nowhere on-chain. We persist it
 * in `localStorage` so Portfolio can show real deposited notes and (experimental)
 * withdraw can rebuild a Merkle witness. This is demo-grade storage: clearing browser
 * data loses access to the notes' funds, exactly like losing a key.
 *
 * BN254 field elements (bigint) are serialized as 0x-hex; amounts as decimal strings.
 */
import { fieldToHex, hexToField, type BalanceNote, type Field } from '@wraith/sdk'
import type { AssetCode } from './wraith-sdk'

const KEY_SPENDING = 'wraith.spendingKey.v1'
const KEY_NOTES = 'wraith.notes.v1'

/** A persisted note: a {@link BalanceNote} plus app bookkeeping. */
export interface StoredNote {
  assetCode: AssetCode
  assetId: string // 0x-hex field
  amount: string // decimal base units (stroops for XLM)
  ownerKey: string
  blinding: string
  spendingKey: string
  commitment: string
  leafIndex?: number
  assetAddress?: string
  spent: boolean
  createdAt: number
  txHash?: string
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function read<T>(key: string, fallback: T): T {
  const ls = safeLocalStorage()
  if (!ls) return fallback
  try {
    const raw = ls.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full / unavailable — non-fatal for the in-memory session */
  }
}

/** Lazily generate (and persist) the wallet's single spending key. */
export function getSpendingKey(): Field {
  const ls = safeLocalStorage()
  const existing = ls?.getItem(KEY_SPENDING)
  if (existing) return hexToField(existing)
  // Generate a fresh 32-byte secret via the platform CSPRNG.
  const buf = new Uint8Array(32)
  globalThis.crypto.getRandomValues(buf)
  let hex = '0x'
  for (const b of buf) hex += b.toString(16).padStart(2, '0')
  const key = hexToField(hex)
  write(KEY_SPENDING, fieldToHex(key))
  return key
}

export function loadNotes(): StoredNote[] {
  return read<StoredNote[]>(KEY_NOTES, [])
}

function saveNotes(notes: StoredNote[]): void {
  write(KEY_NOTES, notes)
}

/** Persist a freshly created note (keyed by commitment; replaces any prior copy). */
export function addNote(
  note: BalanceNote,
  meta: { assetCode: AssetCode; txHash?: string; leafIndex?: number },
): void {
  const stored: StoredNote = {
    assetCode: meta.assetCode,
    assetId: fieldToHex(note.assetId),
    amount: note.amount.toString(),
    ownerKey: fieldToHex(note.ownerKey),
    blinding: fieldToHex(note.blinding),
    spendingKey: fieldToHex(note.spendingKey),
    commitment: fieldToHex(note.commitment),
    spent: false,
    createdAt: Date.now(),
  }
  if (meta.leafIndex !== undefined) stored.leafIndex = meta.leafIndex
  else if (note.leafIndex !== undefined) stored.leafIndex = note.leafIndex
  if (note.assetAddress !== undefined) stored.assetAddress = note.assetAddress
  if (meta.txHash !== undefined) stored.txHash = meta.txHash

  const notes = loadNotes().filter((n) => n.commitment !== stored.commitment)
  notes.push(stored)
  saveNotes(notes)
}

/** Mark a note spent by its commitment hex. */
export function markSpent(commitmentHex: string): void {
  const notes = loadNotes().map((n) => (n.commitment === commitmentHex ? { ...n, spent: true } : n))
  saveNotes(notes)
}

/** Rehydrate a {@link BalanceNote} from a stored record. */
export function toBalanceNote(stored: StoredNote): BalanceNote {
  const note: BalanceNote = {
    assetId: hexToField(stored.assetId),
    amount: BigInt(stored.amount),
    ownerKey: hexToField(stored.ownerKey),
    blinding: hexToField(stored.blinding),
    spendingKey: hexToField(stored.spendingKey),
    commitment: hexToField(stored.commitment),
  }
  if (stored.leafIndex !== undefined) note.leafIndex = stored.leafIndex
  if (stored.assetAddress !== undefined) note.assetAddress = stored.assetAddress
  return note
}
