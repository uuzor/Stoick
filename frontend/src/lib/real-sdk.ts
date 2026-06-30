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
  buildWithdrawInputs,
  bytesToField,
  createNote,
  encodePublicInputs,
  hexToField,
  MerkleTree,
  NoirProver,
  noteNullifier,
  recipientHash,
  WraithContract,
} from '@wraith/sdk'
import {
  Account,
  Contract,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk'
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
  getSpendingKey,
  loadNotes,
  markSpent,
  toBalanceNote,
  type StoredNote,
} from './note-store'
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

const PRICES: Record<AssetCode, number> = { XLM: 0.39, USDC: 1 }

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

    return { hash }
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

    // Rebuild the local mirror of the on-chain tree and verify it matches the pool root.
    const tree = this.reconstructTree()
    const onChainRoot = await this.getLastRoot()
    if (tree.root !== onChainRoot) {
      throw new Error(
        'Local Merkle tree is out of sync with the pool (foreign deposits between yours). On-chain history sync is not implemented for the experimental withdraw.',
      )
    }

    const merkle = tree.generateProof(note.leafIndex!)
    const inputs = buildWithdrawInputs({
      merkleRoot: merkle.root,
      nullifier: noteNullifier(note),
      recipientHash: recipientHash(recipient),
      amount: note.amount,
      assetId: note.assetId,
      noteOwnerKey: note.ownerKey,
      noteBlinding: note.blinding,
      spendingKey: note.spendingKey,
      merklePath: merkle.pathElements,
      merkleIndices: merkle.pathIndices,
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

  /** Rebuild the append-only tree from locally known notes (must be contiguous from 0). */
  private reconstructTree(): MerkleTree {
    const indexed = loadNotes()
      .filter((n): n is StoredNote & { leafIndex: number } => n.leafIndex !== undefined)
      .sort((a, b) => a.leafIndex - b.leafIndex)
    const tree = new MerkleTree()
    indexed.forEach((n, i) => {
      if (n.leafIndex !== i) {
        throw new Error('Cannot reconstruct the Merkle tree: leaves are non-contiguous (foreign deposits).')
      }
      tree.insert(hexToField(n.commitment))
    })
    return tree
  }

  /** Read the pool's current Merkle root via a read-only simulation of `get_last_root`. */
  private async getLastRoot(): Promise<bigint> {
    const server = this.server()
    const from = await this.requireAddress()
    const source = new Account(from, '0')
    const tx = buildTransaction(source, new Contract(POOL_CONTRACT_ID).call('get_last_root'), {
      networkPassphrase: NETWORK_PASSPHRASE,
    })
    const sim = await server.simulateTransaction(tx)
    if (rpc.Api.isSimulationError(sim) || !sim.result?.retval) {
      throw new Error('Could not read the pool root (get_last_root simulation failed).')
    }
    const raw = scValToNative(sim.result.retval) as Uint8Array
    return bytesToField(raw instanceof Uint8Array ? raw : new Uint8Array(raw))
  }

  // --- Not yet wired (clear "coming soon" errors) ---

  async transfer(_params: TransferParams): Promise<TxResult> {
    void _params
    throw new Error('Private transfers are coming soon — not yet wired to the live pool.')
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
