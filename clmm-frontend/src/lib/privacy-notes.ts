import {
  MerkleTree,
  addressToField,
  computeCommitment,
  computeNullifier,
  deriveOwnerKey,
  fieldToHex,
  hash,
  toField,
  type Field,
} from "@wraith/sdk";
import { bytesToFields, fieldToBytes, type FieldHex } from "./bytes";
import type { PoolState } from "./clmm-client";

export interface ClmmNote {
  assetField: Field;
  amount: bigint;
  ownerKey: Field;
  blinding: Field;
  spendingKey: Field;
  commitment: Field;
  leafIndex?: number;
}

export interface PoolStateCommitmentInput {
  poolId: number | bigint;
  asset0: string | Field;
  asset1: string | Field;
  sqrtPrice: bigint;
  liquidity: bigint;
  feeGrowthGlobal0: bigint;
  feeGrowthGlobal1: bigint;
  sequence: bigint;
}

export function clmmAssetField(address: string): Field {
  return addressToField(address);
}

export function createClmmNote(params: {
  assetAddress: string;
  amount: bigint;
  spendingKey: Field | string | bigint | number;
  blinding: Field | string | bigint | number;
  leafIndex?: number;
}): ClmmNote {
  const spendingKey = toField(params.spendingKey);
  const ownerKey = deriveOwnerKey(spendingKey);
  const assetField = clmmAssetField(params.assetAddress);
  const blinding = toField(params.blinding);
  const commitment = computeCommitment(assetField, params.amount, ownerKey, blinding);
  return {
    assetField,
    amount: params.amount,
    ownerKey,
    blinding,
    spendingKey,
    commitment,
    leafIndex: params.leafIndex,
  };
}

export function noteNullifier(note: Pick<ClmmNote, "commitment" | "spendingKey">): Field {
  return computeNullifier(note.commitment, note.spendingKey);
}

export function poolStateCommitment(input: PoolStateCommitmentInput): Field {
  const asset0 = typeof input.asset0 === "string" ? clmmAssetField(input.asset0) : input.asset0;
  const asset1 = typeof input.asset1 === "string" ? clmmAssetField(input.asset1) : input.asset1;
  return hash([
    input.poolId,
    asset0,
    asset1,
    input.sqrtPrice,
    input.liquidity,
    input.feeGrowthGlobal0,
    input.feeGrowthGlobal1,
    input.sequence,
  ]);
}

export function poolStateCommitmentFromPool(pool: PoolState): Field {
  return poolStateCommitment({
    poolId: pool.pool_id,
    asset0: pool.asset_0,
    asset1: pool.asset_1,
    sqrtPrice: pool.sqrt_price,
    liquidity: pool.liquidity,
    feeGrowthGlobal0: pool.fee_growth_global_0,
    feeGrowthGlobal1: pool.fee_growth_global_1,
    sequence: pool.sequence,
  });
}

export function fieldHex(value: Field | bigint | number | string): FieldHex {
  return fieldToHex(toField(value)) as FieldHex;
}

export function fieldBytes(value: Field | bigint | number | string): Uint8Array {
  return fieldToBytes(fieldHex(value));
}

export function fieldsFromBytes(bytes: Uint8Array): Field[] {
  return bytesToFields(bytes).map((field) => toField(field));
}

export function buildMerkleTreeFromLeaves(leaves: readonly Field[]): MerkleTree {
  const tree = new MerkleTree();
  for (const leaf of leaves) {
    tree.insert(leaf);
  }
  return tree;
}
