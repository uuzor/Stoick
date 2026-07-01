/**
 * Merkle witnesses from the pool's on-chain frontier.
 *
 * The pool is an append-only incremental Merkle tree (SHARED §5). It stores only the
 * *frontier* (`filledSubtrees`) + a 100-deep root history — never the full leaf set —
 * and the testnet RPC prunes old events, so the historical leaves needed to rebuild the
 * tree the usual way are simply gone.
 *
 * But we don't need them. The authentication path of the **most-recently appended leaf**
 * is fully determined by the frontier: at level `i`, the sibling is `Frontier(i)` when the
 * leaf's index bit is 1 (it's a right child) and the empty-subtree `ZEROS[i]` when the bit
 * is 0. So we read the frontier from instance storage and build the witness directly. We
 * capture it at deposit time (while the note is still the latest leaf) and prove later
 * against that historical — but still `is_known_root` — root.
 */
import { Contract, rpc, scValToNative, xdr } from '@stellar/stellar-sdk'
import {
  bytesToField,
  fieldToHex,
  hash2,
  hexToField,
  MerkleTree,
  TREE_DEPTH,
  ZEROS,
  type Field,
} from '@wraith/sdk'

export interface PoolTreeState {
  /** `filledSubtrees[i]` for i in [0, TREE_DEPTH). */
  frontier: Field[]
  /** Next leaf index (= current leaf count). */
  nextIndex: number
  /** Current (last) root. */
  lastRoot: Field
  /** Retained root history (oldest first), mirroring the contract's ring buffer. */
  roots: Field[]
}

export interface StoredWitness {
  pathElements: string[] // hex fields, length TREE_DEPTH
  pathIndices: number[]
  root: string // hex field
  leafIndex: number
}

export interface MerkleWitness {
  pathElements: Field[]
  pathIndices: number[]
  root: Field
}

/** Read the incremental-tree state (frontier + roots) from the pool's instance storage. */
export async function readPoolTreeState(server: rpc.Server, poolId: string): Promise<PoolTreeState> {
  const resp = await server.getLedgerEntries(new Contract(poolId).getFootprint())
  if (!resp.entries?.length) throw new Error('Could not read the pool instance storage.')
  const storage = resp.entries[0].val.contractData().val().instance().storage() ?? []

  const frontier: Field[] = new Array(TREE_DEPTH)
  let nextIndex = 0
  let roots: Field[] = []
  for (const e of storage) {
    const key = e.key()
    if (key.switch() !== xdr.ScValType.scvVec()) continue
    const parts = key.vec() ?? []
    if (parts.length === 0) continue
    const tag = parts[0]!.sym().toString()
    if (tag === 'Frontier') {
      frontier[parts[1]!.u32()] = bytesToField(scValToNative(e.val()) as Uint8Array)
    } else if (tag === 'NextIndex') {
      nextIndex = Number(scValToNative(e.val()))
    } else if (tag === 'Roots') {
      roots = (scValToNative(e.val()) as Uint8Array[]).map(bytesToField)
    }
  }
  // Levels whose bit was never 0 default to the empty-subtree constant.
  for (let i = 0; i < TREE_DEPTH; i++) if (frontier[i] === undefined) frontier[i] = ZEROS[i]!
  const lastRoot = roots.length ? roots[roots.length - 1]! : ZEROS[TREE_DEPTH]!
  return { frontier, nextIndex, lastRoot, roots }
}

/**
 * Build the Merkle witness for `commitment` at `leafIndex`, assuming it is the latest
 * leaf (index === nextIndex - 1). Validates by folding to the on-chain root; throws if
 * the note is no longer the latest leaf (the tree advanced under a concurrent insert).
 */
export function witnessForLatestLeaf(commitment: Field, leafIndex: number, state: PoolTreeState): MerkleWitness {
  const pathElements: Field[] = []
  const pathIndices: number[] = []
  let idx = leafIndex
  for (let level = 0; level < TREE_DEPTH; level++) {
    const bit = idx & 1
    pathElements.push(bit === 1 ? state.frontier[level]! : ZEROS[level]!)
    pathIndices.push(bit)
    idx = Math.floor(idx / 2)
  }
  const root = MerkleTree.rootFromProof({ leaf: commitment, pathElements, pathIndices })
  if (root !== state.lastRoot) {
    throw new Error(
      'Merkle witness does not fold to the on-chain root — the note is not the latest leaf (the tree advanced). Its path must be captured at deposit time.',
    )
  }
  return { pathElements, pathIndices, root }
}

/** Serialize a witness for persistence in the note store. */
export function encodeWitness(w: MerkleWitness, leafIndex: number): StoredWitness {
  return {
    pathElements: w.pathElements.map(fieldToHex),
    pathIndices: w.pathIndices,
    root: fieldToHex(w.root),
    leafIndex,
  }
}

/** Rehydrate a persisted witness. */
export function decodeWitness(s: StoredWitness): MerkleWitness {
  return {
    pathElements: s.pathElements.map(hexToField),
    pathIndices: s.pathIndices,
    root: hexToField(s.root),
  }
}

/**
 * Compute the Merkle witnesses for `leaves` appended at index `base` onto a tree whose
 * pre-append frontier is `frontierBefore`, against the resulting (post-append) root.
 *
 * Used by the sender to hand the recipient a spendable witness for the output note it
 * created — that note is NOT the latest leaf (the change note follows it), so
 * `witnessForLatestLeaf` doesn't apply. The new leaves are contiguous, so at each level a
 * missing sibling is either the old left boundary (`frontierBefore[level]`) or an empty
 * right subtree (`ZEROS[level]`).
 */
export function witnessesAfterInserts(
  frontierBefore: Field[],
  base: number,
  leaves: Field[],
): MerkleWitness[] {
  const m = leaves.length
  const total = base + m
  const isOld = (node: number, level: number) => (node + 1) * 2 ** level <= base

  let layer = new Map<number, Field>()
  leaves.forEach((leaf, j) => layer.set(base + j, leaf))
  const paths = leaves.map(() => ({ pathElements: [] as Field[], pathIndices: [] as number[] }))

  for (let level = 0; level < TREE_DEPTH; level += 1) {
    // Record each new leaf's sibling at this level.
    for (let j = 0; j < m; j += 1) {
      const node = (base + j) >> level
      const sibling = node ^ 1
      const value = layer.has(sibling)
        ? layer.get(sibling)!
        : isOld(sibling, level)
          ? frontierBefore[level]!
          : ZEROS[level]!
      paths[j]!.pathElements.push(value)
      paths[j]!.pathIndices.push(node & 1)
    }
    // Fold to the next level over the new region (+ its boundary parents).
    const next = new Map<number, Field>()
    const minNode = base >> level
    const maxNode = (total - 1) >> level
    for (let node = minNode; node <= maxNode; node += 1) {
      const parent = node >> 1
      if (next.has(parent)) continue
      const left = parent * 2
      const right = parent * 2 + 1
      const leftVal = layer.has(left) ? layer.get(left)! : isOld(left, level) ? frontierBefore[level]! : ZEROS[level]!
      const rightVal = layer.has(right) ? layer.get(right)! : ZEROS[level]!
      next.set(parent, hash2(leftVal, rightVal))
    }
    layer = next
  }

  return paths.map((p, j) => ({
    pathElements: p.pathElements,
    pathIndices: p.pathIndices,
    root: MerkleTree.rootFromProof({ leaf: leaves[j]!, pathElements: p.pathElements, pathIndices: p.pathIndices }),
  }))
}

/** The empty-subtree path used for a 0-amount dummy input (the circuit skips its check). */
export function dummyPath(): { pathElements: Field[]; pathIndices: number[] } {
  return {
    pathElements: ZEROS.slice(0, TREE_DEPTH) as Field[],
    pathIndices: new Array<number>(TREE_DEPTH).fill(0),
  }
}
