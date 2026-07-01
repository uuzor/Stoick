/**
 * RealWraithSdk — the live client that talks to the deployed WraithPool on Stellar
 * Testnet, backed by `@wraith/sdk` (crypto + Soroban op building), `@stellar/stellar-sdk`
 * (RPC submit) and the Stellar Wallets Kit (multi-wallet address + signing).
 *
 * It implements the same `WraithSdk` surface the UI is written against (see
 * `wraith-sdk.ts`), so it drops in behind `createWraithSdk()` with no UI changes.
 *
 * Flow status:
 *   deposit              LIVE  — generates a note, builds + signs + submits the on-chain
 *                                deposit, persists the note locally.
 *   getShieldedBalances  LIVE  — derived from locally-stored notes.
 *   getOpenOrders        LIVE  — local (empty until placeOrder ships).
 *   withdraw             EXPERIMENTAL — real in-browser UltraHonk proof (flag-gated).
 *   transfer/placeOrder/cancelOrder  — not yet wired (clear "coming soon" errors).
 */
import {
  buildTransaction,
  buildTransferInputs,
  buildWithdrawInputs,
  createNote,
  createOutputNote,
  encodePublicInputs,
  fieldToHex,
  hexToField,
  NoirProver,
  noteNullifier,
  recipientHash,
  toField,
  WraithContract,
  type Field,
} from '@wraith/sdk'
import { rpc, scValToNative, TransactionBuilder, xdr } from '@stellar/stellar-sdk'
import {
  ASSET_CONFIG,
  ENABLE_WITHDRAW,
  NETWORK_PASSPHRASE,
  POOL_CONTRACT_ID,
  SOROBAN_RPC_URL,
} from './config'
import { getKitAddress, signWithKit } from './wallet-kit'
import { formatAmount } from './format'
import {
  addNote,
  attachWitness,
  getSpendingKey,
  loadNotes,
  markSpent,
  toBalanceNote,
  type StoredNote,
} from './note-store'
import {
  decodeWitness,
  dummyPath,
  encodeWitness,
  readPoolTreeState,
  witnessesAfterInserts,
  witnessForLatestLeaf,
  type MerkleWitness,
} from './merkle-witness'
import { decodeReceiveCode, encryptNote, type NotePayload } from './note-crypto'
import type {
  AssetCode,
  DepositParams,
  OpenOrder,
  PlaceOrderParams,
  PlaceOrderResult,
  ShieldedBalance,
  TransferParams,
  TxResult,
  WithdrawParams,
  WraithSdk,
} from './wraith-sdk'

const PRICES: Record<AssetCode, number> = { XLM: 0.39, USDC: 1, bETH: 3500, bUSDC: 1 }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Parse a human decimal string into integer base units (e.g. "1.5" XLM -> 15000000n). */
export function toBaseUnits(input: string, decimals: number): bigint {
  const trimmed = input.replace(/,/g, '').trim()
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    throw new Error(`Invalid amount: "${input}"`)
  }
  const [whole, frac = ''] = trimmed.split('.')
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0')
}

/** Convert integer base units back to a JS number for display/estimates. */
export function baseUnitsToNumber(value: bigint, decimals: number): number {
  const divisor = 10 ** decimals
  return Number(value) / divisor
}

function walletError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return typeof err === 'string' ? err : 'The wallet rejected the request.'
}

export class RealWraithSdk implements WraithSdk {
  private readonly contract = new WraithContract({
    contractId: POOL_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
  })

  private server(): rpc.Server {
    return new rpc.Server(SOROBAN_RPC_URL)
  }

  /** The active wallet account, or a clear error if not connected. */
  private async requireAddress(): Promise<string> {
    try {
      return await getKitAddress()
    } catch (err) {
      throw new Error(
        err instanceof Error && err.message
          ? err.message
          : 'Connect a Stellar wallet (on Testnet) before submitting.',
      )
    }
  }

  /**
   * Prepare → sign (via the connected wallet) → submit → confirm a single invoke op.
   * Returns the tx hash plus the contract's return value (the deposit leaf index, for
   * instance).
   */
  private async submitOp(
    op: xdr.Operation,
    from: string,
  ): Promise<{ hash: string; returnValue?: xdr.ScVal }> {
    const server = this.server()
    const account = await server.getAccount(from)
    const tx = buildTransaction(account, op, {
      networkPassphrase: NETWORK_PASSPHRASE,
      timeoutSeconds: 120,
    })
    // Simulate to compute the Soroban footprint, auth and resource fees.
    const prepared = await server.prepareTransaction(tx)
    let signedTxXdr: string
    try {
      signedTxXdr = await signWithKit(prepared.toXDR(), from)
    } catch (err) {
      throw new Error(walletError(err))
    }
    const signed = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE)
    const sent = await server.sendTransaction(signed)
    if (sent.status === 'ERROR') {
      throw new Error(`Submission failed: ${JSON.stringify(sent.errorResult ?? sent.status)}`)
    }
    const final = await this.awaitConfirmation(server, sent.hash)
    const out: { hash: string; returnValue?: xdr.ScVal } = { hash: sent.hash }
    if (final.returnValue) out.returnValue = final.returnValue
    return out
  }

  private async awaitConfirmation(
    server: rpc.Server,
    hash: string,
  ): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
    const deadline = Date.now() + 90_000
    for (;;) {
      const res = await server.getTransaction(hash)
      if (res.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
        if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) return res
        throw new Error(`Transaction ${hash} failed on-chain (${res.status}).`)
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out awaiting confirmation for ${hash}.`)
      }
      await sleep(2000)
    }
  }

  // --- Bridge: deposit (LIVE) ---

  async deposit({ asset, amount }: DepositParams): Promise<TxResult> {
    const cfg = ASSET_CONFIG[asset]
    if (!cfg.sac) {
      throw new Error(
        `${asset} is not configured for this deployment (no SAC address). The live testnet pool is single-asset (native XLM).`,
      )
    }
    const amountBase = toBaseUnits(amount, cfg.decimals)
    if (amountBase <= 0n) throw new Error('Amount must be greater than zero.')

    const from = await this.requireAddress()
    const note = createNote({
      assetId: cfg.assetId,
      amount: amountBase,
      spendingKey: getSpendingKey(),
    })
    note.assetAddress = cfg.sac

    const op = this.contract.depositOp({
      from,
      asset: cfg.sac,
      amount: amountBase,
      commitment: note.commitment,
    })

    const { hash, returnValue } = await this.submitOp(op, from)

    // The pool's `deposit` returns the new leaf index (u32) — capture it for withdraw.
    let leafIndex: number | undefined
    if (returnValue) {
      try {
        leafIndex = Number(scValToNative(returnValue))
      } catch {
        leafIndex = undefined
      }
    }
    const meta: { assetCode: AssetCode; txHash: string; leafIndex?: number } = {
      assetCode: asset,
      txHash: hash,
    }
    if (leafIndex !== undefined) meta.leafIndex = leafIndex
    addNote(note, meta)

    // Capture the note's Merkle witness now, while it is the latest leaf — this is what
    // lets it be spent later (transfer/withdraw) without the full leaf history.
    if (leafIndex !== undefined) {
      await this.captureWitness(note.commitment, leafIndex).catch((err) =>
        console.warn('Merkle witness capture failed; sending this note will be unavailable.', err),
      )
    }

    return { hash }
  }

  /** Read the pool frontier and persist a note's Merkle witness (it must be the latest leaf).
   *  `leafIndex` defaults to the current last leaf — correct for a note just appended. */
  private async captureWitness(commitment: Field, leafIndex?: number): Promise<void> {
    const state = await readPoolTreeState(this.server(), POOL_CONTRACT_ID)
    const idx = leafIndex ?? state.nextIndex - 1
    const witness = witnessForLatestLeaf(commitment, idx, state)
    attachWitness(fieldToHex(commitment), encodeWitness(witness, idx))
  }

  /**
   * Resolve a spendable Merkle witness for a stored note: prefer the one captured at
   * deposit time (validating its root is still in the pool's 100-root history); otherwise
   * reconstruct from the live frontier if the note is still the latest leaf.
   */
  private async resolveWitness(stored: StoredNote): Promise<MerkleWitness> {
    if (stored.merklePath && stored.merkleIndices && stored.merkleRoot && stored.leafIndex !== undefined) {
      const witness = decodeWitness({
        pathElements: stored.merklePath,
        pathIndices: stored.merkleIndices,
        root: stored.merkleRoot,
        leafIndex: stored.leafIndex,
      })
      const state = await readPoolTreeState(this.server(), POOL_CONTRACT_ID)
      if (!state.roots.some((r) => r === witness.root)) {
        throw new Error(
          "This note's Merkle root has aged out of the pool's 100-root history. Deposit again to refresh it.",
        )
      }
      return witness
    }
    if (stored.leafIndex === undefined) {
      throw new Error('This note has no leaf index; its Merkle proof cannot be built.')
    }
    const state = await readPoolTreeState(this.server(), POOL_CONTRACT_ID)
    if (stored.leafIndex !== state.nextIndex - 1) {
      throw new Error(
        'This note predates the transfer feature and is no longer the latest leaf, so its Merkle path was never captured. Deposit again to enable sending it.',
      )
    }
    return witnessForLatestLeaf(hexToField(stored.commitment), stored.leafIndex, state)
  }

  // --- Views (LIVE, from local notes) ---

  async getShieldedBalances(): Promise<ShieldedBalance[]> {
    const totals = new Map<AssetCode, bigint>()
    for (const n of loadNotes()) {
      if (n.spent) continue
      totals.set(n.assetCode, (totals.get(n.assetCode) ?? 0n) + BigInt(n.amount))
    }
    const out: ShieldedBalance[] = []
    for (const [asset, base] of totals) {
      if (base <= 0n) continue
      const decimals = ASSET_CONFIG[asset]?.decimals ?? 7
      const human = baseUnitsToNumber(base, decimals)
      out.push({
        asset,
        amount: formatAmount(human),
        usdEstimate: Math.round(human * PRICES[asset] * 100) / 100,
      })
    }
    return out
  }

  async getOpenOrders(): Promise<OpenOrder[]> {
    // Orders ship with placeOrder; none are persisted yet.
    return []
  }

  // --- Bridge: withdraw (EXPERIMENTAL, in-browser proof) ---

  async withdraw({ asset, amount, recipient }: WithdrawParams): Promise<TxResult> {
    if (!ENABLE_WITHDRAW) {
      throw new Error(
        'Withdraw is experimental and currently disabled. Set VITE_ENABLE_WITHDRAW=true to enable in-browser ZK proving (heavy: loads Noir + Barretenberg WASM).',
      )
    }
    const cfg = ASSET_CONFIG[asset]
    if (!cfg.sac) throw new Error(`${asset} is not configured for this deployment.`)

    const amountBase = toBaseUnits(amount, cfg.decimals)
    const candidate = loadNotes().find(
      (n) => !n.spent && n.assetCode === asset && BigInt(n.amount) === amountBase && n.leafIndex !== undefined,
    )
    if (!candidate) {
      throw new Error(
        'No shielded note of exactly this amount is available. The experimental withdraw consumes one full note (no change output).',
      )
    }
    const note = toBalanceNote(candidate)

    // The note's Merkle witness comes from the frontier captured at deposit time.
    const witness = await this.resolveWitness(candidate)
    const inputs = buildWithdrawInputs({
      merkleRoot: witness.root,
      nullifier: noteNullifier(note),
      recipientHash: recipientHash(recipient),
      amount: note.amount,
      assetId: note.assetId,
      noteOwnerKey: note.ownerKey,
      noteBlinding: note.blinding,
      spendingKey: note.spendingKey,
      merklePath: witness.pathElements,
      merkleIndices: witness.pathIndices,
    })

    const circuit = await fetch(`${import.meta.env.BASE_URL}circuits/withdraw.json`).then((r) => {
      if (!r.ok) throw new Error('Compiled withdraw circuit missing at /circuits/withdraw.json.')
      return r.json()
    })
    const prover = new NoirProver(circuit)
    let proof
    try {
      proof = await prover.prove(inputs)
    } finally {
      await prover.destroy().catch(() => undefined)
    }

    const from = await this.requireAddress()
    const op = this.contract.withdrawOp({
      proof: proof.proof,
      publicInputs: encodePublicInputs(proof.publicInputs),
      recipient,
      amount: note.amount,
      asset: cfg.sac,
    })
    const { hash } = await this.submitOp(op, from)
    markSpent(candidate.commitment)
    return { hash }
  }

  // --- Pay: private transfer (LIVE, in-browser UltraHonk proof) ---

  async transfer({ recipientKey, asset, amount }: TransferParams): Promise<TxResult> {
    const cfg = ASSET_CONFIG[asset]
    const amountBase = toBaseUnits(amount, cfg.decimals)
    if (amountBase <= 0n) throw new Error('Amount must be greater than zero.')
    const code = decodeReceiveCode(recipientKey)

    // Single-input transfer: pick the smallest unspent note of this asset that covers the
    // amount (the circuit is 2-in/2-out; the second input is a 0-amount dummy).
    const chosen = loadNotes()
      .filter((n) => !n.spent && n.assetCode === asset && n.leafIndex !== undefined && BigInt(n.amount) >= amountBase)
      .sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? -1 : BigInt(a.amount) > BigInt(b.amount) ? 1 : 0))[0]
    if (!chosen) {
      throw new Error(
        'No single shielded note covers this amount. Deposit into one note first, or send a smaller amount.',
      )
    }

    const input = toBalanceNote(chosen)
    const witness = await this.resolveWitness(chosen)
    const assetId = input.assetId
    const changeAmount = input.amount - amountBase

    const spendingKey = getSpendingKey()
    const recipientNote = createOutputNote({ assetId, amount: amountBase, ownerKey: code.ownerKey })
    const changeNote = createNote({ assetId, amount: changeAmount, spendingKey })
    const dummy = createNote({ assetId, amount: 0n, spendingKey })
    const dp = dummyPath()

    const inputs = buildTransferInputs({
      merkleRoot: witness.root,
      nullifiers: [noteNullifier(input), noteNullifier(dummy)],
      outCommitments: [recipientNote.commitment, changeNote.commitment],
      extDataHash: toField(0n),
      inNotes: [
        {
          amount: input.amount,
          assetId,
          spendingKey: input.spendingKey,
          blinding: input.blinding,
          merklePath: witness.pathElements,
          merkleIndices: witness.pathIndices,
        },
        {
          amount: 0n,
          assetId,
          spendingKey: dummy.spendingKey,
          blinding: dummy.blinding,
          merklePath: dp.pathElements,
          merkleIndices: dp.pathIndices,
        },
      ],
      outNotes: [
        { amount: recipientNote.amount, assetId, ownerKey: recipientNote.ownerKey, blinding: recipientNote.blinding },
        { amount: changeNote.amount, assetId, ownerKey: changeNote.ownerKey, blinding: changeNote.blinding },
      ],
    })

    const circuit = await fetch(`${import.meta.env.BASE_URL}circuits/transfer.json`).then((r) => {
      if (!r.ok) throw new Error('Compiled transfer circuit missing at /circuits/transfer.json.')
      return r.json()
    })
    const prover = new NoirProver(circuit)
    let proof
    try {
      proof = await prover.prove(inputs)
      // Verify locally against the same transcript before paying gas — a wrong witness
      // (e.g. the note's root aged out) fails here instead of on-chain.
      if (!(await prover.verify(proof))) {
        throw new Error('Local proof verification failed — aborting before submit.')
      }
    } finally {
      await prover.destroy().catch(() => undefined)
    }

    // Note delivery: read the frontier now (post-proving, pre-submit), compute the two
    // output notes' witnesses, and seal the recipient note (fields + witness) to their
    // viewing key so they can discover and later spend it. The change memo is left empty —
    // we keep the change note locally.
    const pre = await readPoolTreeState(this.server(), POOL_CONTRACT_ID)
    const base = pre.nextIndex
    const [recipientWitness, changeWitness] = witnessesAfterInserts(pre.frontier, base, [
      recipientNote.commitment,
      changeNote.commitment,
    ])
    const payload: NotePayload = {
      v: 1,
      code: asset,
      assetId: fieldToHex(assetId),
      amount: amountBase.toString(),
      ownerKey: fieldToHex(code.ownerKey),
      blinding: fieldToHex(recipientNote.blinding),
      commitment: fieldToHex(recipientNote.commitment),
      leafIndex: base,
      root: fieldToHex(recipientWitness.root),
      path: recipientWitness.pathElements.map(fieldToHex),
      indices: recipientWitness.pathIndices,
    }
    const memos = [encryptNote(code.encPub, payload), new Uint8Array(0)]

    const from = await this.requireAddress()
    const op = this.contract.transferOp({
      proof: proof.proof,
      publicInputs: encodePublicInputs(proof.publicInputs),
      memos,
    })
    const { hash } = await this.submitOp(op, from)

    // Local wallet update: the input note is spent; keep the change note (out index base+1)
    // with the witness we just computed so it can be spent again.
    markSpent(chosen.commitment)
    if (changeAmount > 0n) {
      addNote(changeNote, { assetCode: asset, txHash: hash })
      attachWitness(fieldToHex(changeNote.commitment), encodeWitness(changeWitness, base + 1))
    }
    return { hash }
  }

  async placeOrder(_params: PlaceOrderParams): Promise<PlaceOrderResult> {
    void _params
    throw new Error('The dark-pool DEX is coming soon — order placement is not yet wired to the live pool.')
  }

  async cancelOrder(_orderId: string): Promise<TxResult> {
    void _orderId
    throw new Error('Order cancellation is coming soon — not yet wired to the live pool.')
  }
}
