/**
 * Recipient-side note discovery.
 *
 * Scans the pool's `transfer` events, trial-decrypts each memo with the wallet's viewing
 * key, and — for a memo that decrypts to a note addressed to us whose commitment is a real
 * on-chain output — adds it to the local store so the balance rises. The transport is
 * untrusted: a forged memo either fails to decrypt or its commitment won't match an
 * emitted output, so it can never mint balance.
 */
import { rpc, scValToNative } from '@stellar/stellar-sdk'
import { computeCommitment, fieldToHex, hexToField } from '@wraith/sdk'
import { POOL_CONTRACT_ID, SOROBAN_RPC_URL } from './config'
import { decryptNote, type EncKeypair } from './note-crypto'
import { getSpendingKey, upsertReceivedNote } from './note-store'
import type { AssetCode } from './wraith-sdk'

// v2: v1 cursors may have been advanced past events by an earlier single-page scan bug.
const scanCursorKey = () => `wraith.scan.v2:${POOL_CONTRACT_ID}`
const FIRST_RUN_WINDOW = 17_000 // ~1 day of ledgers on the first scan

function toHex(bytes: Uint8Array): string {
  let s = '0x'
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

function readCursor(): number {
  try {
    return Number(globalThis.localStorage?.getItem(scanCursorKey()) ?? 0)
  } catch {
    return 0
  }
}
function writeCursor(ledger: number): void {
  try {
    globalThis.localStorage?.setItem(scanCursorKey(), String(ledger))
  } catch {
    /* ignore */
  }
}

interface TransferEventData {
  commitments: Uint8Array[]
  indices: Array<number | bigint>
  memos: Uint8Array[]
}

function ingest(
  ev: rpc.Api.EventResponse,
  recipient: EncKeypair,
  ownerKeyHex: string,
  spendingKeyHex: string,
): number {
  const topic0 = (() => {
    try {
      return String(scValToNative(ev.topic[0]!))
    } catch {
      return ''
    }
  })()
  if (topic0 !== 'transfer') return 0

  let data: TransferEventData
  try {
    data = scValToNative(ev.value) as TransferEventData
  } catch {
    return 0
  }
  if (!data?.memos?.length) return 0

  let added = 0
  for (let i = 0; i < data.memos.length; i += 1) {
    const blob = data.memos[i]
    if (!(blob instanceof Uint8Array) || blob.length === 0) continue
    const payload = decryptNote(recipient, blob)
    if (!payload) continue
    // Addressed to us?
    if (payload.ownerKey.toLowerCase() !== ownerKeyHex.toLowerCase()) continue
    // Payload integrity: the commitment must match its own fields…
    const recomputed = fieldToHex(
      computeCommitment(
        hexToField(payload.assetId),
        BigInt(payload.amount),
        hexToField(payload.ownerKey),
        hexToField(payload.blinding),
      ),
    )
    if (recomputed.toLowerCase() !== payload.commitment.toLowerCase()) continue
    // …and it must be the real on-chain output at this position (no forged balance).
    const onChain = data.commitments[i]
    if (!(onChain instanceof Uint8Array) || toHex(onChain).toLowerCase() !== payload.commitment.toLowerCase()) continue

    const leafIndex = Number(data.indices[i])
    const ok = upsertReceivedNote({
      assetCode: payload.code as AssetCode,
      assetId: payload.assetId,
      amount: payload.amount,
      ownerKey: payload.ownerKey,
      blinding: payload.blinding,
      spendingKey: spendingKeyHex,
      commitment: payload.commitment,
      leafIndex,
      merklePath: payload.path,
      merkleIndices: payload.indices,
      merkleRoot: payload.root,
    })
    if (ok) added += 1
  }
  return added
}

/**
 * Scan for incoming notes since the last cursor. Returns the number of new notes added.
 * Advances the cursor to the latest ledger so subsequent calls are incremental.
 */
export async function scanIncomingNotes(recipient: EncKeypair, ownerKeyHex: string): Promise<number> {
  const server = new rpc.Server(SOROBAN_RPC_URL)
  let latest: number
  try {
    latest = (await server.getLatestLedger()).sequence
  } catch {
    return 0
  }
  const stored = readCursor()
  const start = stored > 0 ? Math.min(stored, latest) : Math.max(1, latest - FIRST_RUN_WINDOW)

  const spendingKeyHex = fieldToHex(getSpendingKey())
  const filters = [{ type: 'contract' as const, contractIds: [POOL_CONTRACT_ID] }]
  let added = 0
  let cursor: string | undefined
  try {
    // getEvents scans only a bounded ledger window per call and ALWAYS returns a cursor,
    // so we must follow the cursor forward through empty windows until it stalls (the
    // returned cursor stops advancing = caught up to `latestLedger`). Breaking on an empty
    // page would stop before reaching ledgers where the events actually are.
    for (let page = 0; page < 60; page += 1) {
      const res = await server.getEvents(
        cursor ? { filters, cursor, limit: 200 } : { filters, startLedger: start, limit: 200 },
      )
      for (const ev of res.events ?? []) added += ingest(ev, recipient, ownerKeyHex, spendingKeyHex)
      const nextCursor = res.cursor
      if (!nextCursor || nextCursor === cursor) break // no cursor / no advance -> caught up
      cursor = nextCursor
    }
  } catch (err) {
    console.warn('note scan failed (RPC / retention window):', err)
  }
  writeCursor(latest + 1)
  return added
}
