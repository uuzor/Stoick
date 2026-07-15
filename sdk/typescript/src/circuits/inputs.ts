/**
 * Circuit input generation for CLMM ZK proofs
 * 
 * Generates witness inputs for Noir circuits
 */

import { Field, CircuitType, Note, Position, PoolState, MerkleProof } from '../types';
import {
  bigIntToField,
  numberToField,
  hexToField,
  deriveOwnerKey,
  computeNoteCommitment,
  computeNoteNullifier,
  computePositionCommitment,
  computePositionNullifier
} from '../crypto/poseidon';

/**
 * Public inputs for CLMM circuits
 */
export interface PublicInputs {
  merkleRoot: Field;
  positionNullifier: Field;
  oldPositionCommitment: Field;
  newPositionCommitment: Field;
  poolStateOldCommitment: Field;
  poolStateNewCommitment: Field;
  inputNoteNullifier: Field;
  outputNoteCommitment: Field;
  slippageMinCommitment: Field;
}

/**
 * Private inputs for CLMM mint circuit
 */
export interface MintPrivateInputs {
  // Input note
  inNoteAssetId: Field;
  inNoteAmount: Field;
  inNoteOwnerKey: Field;
  inNoteSpendingKey: Field;
  inNoteBlinding: Field;
  inNoteMerklePath: Field[];
  inNoteMerkleIndices: Field[];
  
  // Position
  poolId: Field;
  tickLower: Field;
  tickUpper: Field;
  liquidityDelta: Field;
  feeGrowthInside0Last: Field;
  feeGrowthInside1Last: Field;
  tokensOwed0: Field;
  tokensOwed1: Field;
  positionNonce: Field;
  positionBlinding: Field;
  ownerSpendingKey: Field;
  
  // Pool state
  poolAsset0: Field;
  poolAsset1: Field;
  poolSqrtPrice: Field;
  poolCurrentTick: Field;
  poolLiquidity: Field;
  poolFeeGrowthGlobal0: Field;
  poolFeeGrowthGlobal1: Field;
  poolProtocolFee0: Field;
  poolProtocolFee1: Field;
  poolSequence: Field;
  poolTickSpacing: Field;
  
  // Slippage
  minToken0: Field;
  minToken1: Field;
}

/**
 * Generate public inputs for mint circuit
 */
export function generateMintPublicInputs(params: {
  merkleRoot: Field;
  inputNote: Note;
  oldPositionCommitment: Field;
  newPositionCommitment: Field;
  positionNullifier: Field;
  poolStateOld: Field;
  poolStateNew: Field;
  outputNoteCommitment: Field;
  minSlippage: Field;
}): PublicInputs {
  return {
    merkleRoot: params.merkleRoot,
    positionNullifier: params.positionNullifier,
    oldPositionCommitment: params.oldPositionCommitment,
    newPositionCommitment: params.newPositionCommitment,
    poolStateOldCommitment: params.poolStateOld,
    poolStateNewCommitment: params.poolStateNew,
    inputNoteNullifier: params.inputNote.nullifier,
    outputNoteCommitment: params.outputNoteCommitment,
    slippageMinCommitment: params.minSlippage
  };
}

/**
 * Generate private inputs for mint circuit
 */
export function generateMintPrivateInputs(params: {
  inputNote: Note;
  merkleProof: MerkleProof;
  poolId: number;
  tickLower: number;
  tickUpper: number;
  liquidityDelta: bigint;
  position: Position | null;
  pool: PoolState;
  minToken0: bigint;
  minToken1: bigint;
}): MintPrivateInputs {
  const { inputNote, merkleProof, poolId, tickLower, tickUpper, liquidityDelta, position, pool, minToken0, minToken1 } = params;
  
  return {
    // Input note
    inNoteAssetId: numberToField(inputNote.assetId),
    inNoteAmount: bigIntToField(inputNote.amount),
    inNoteOwnerKey: inputNote.ownerKey,
    inNoteSpendingKey: bigIntToField(inputNote.spendingKey),
    inNoteBlinding: bigIntToField(inputNote.blinding),
    inNoteMerklePath: merkleProof.path,
    inNoteMerkleIndices: merkleProof.indices,
    
    // Position
    poolId: numberToField(poolId),
    tickLower: numberToField(tickLower),
    tickUpper: numberToField(tickUpper),
    liquidityDelta: bigIntToField(liquidityDelta),
    feeGrowthInside0Last: bigIntToField(position?.feeGrowthInside0Last || 0n),
    feeGrowthInside1Last: bigIntToField(position?.feeGrowthInside1Last || 0n),
    tokensOwed0: bigIntToField(position?.tokensOwed0 || 0n),
    tokensOwed1: bigIntToField(position?.tokensOwed1 || 0n),
    positionNonce: numberToField(position?.nonce || 0),
    positionBlinding: bigIntToField(position?.blinding || inputNote.blinding),
    ownerSpendingKey: bigIntToField(inputNote.spendingKey),
    
    // Pool state
    poolAsset0: numberToField(pool.asset0),
    poolAsset1: numberToField(pool.asset1),
    poolSqrtPrice: bigIntToField(pool.sqrtPrice),
    poolCurrentTick: numberToField(pool.currentTick),
    poolLiquidity: bigIntToField(pool.liquidity),
    poolFeeGrowthGlobal0: bigIntToField(pool.feeGrowthGlobal0),
    poolFeeGrowthGlobal1: bigIntToField(pool.feeGrowthGlobal1),
    poolProtocolFee0: bigIntToField(pool.protocolFee0),
    poolProtocolFee1: bigIntToField(pool.protocolFee1),
    poolSequence: bigIntToField(pool.sequence),
    poolTickSpacing: numberToField(pool.tickSpacing),
    
    // Slippage
    minToken0: bigIntToField(minToken0),
    minToken1: bigIntToField(minToken1)
  };
}

/**
 * Generate complete witness for mint circuit
 */
export function generateMintWitness(params: {
  merkleRoot: Field;
  inputNote: Note;
  merkleProof: MerkleProof;
  poolId: number;
  tickLower: number;
  tickUpper: number;
  liquidityDelta: bigint;
  existingPosition: Position | null;
  pool: PoolState;
  minToken0: bigint;
  minToken1: bigint;
}): {
  publicInputs: PublicInputs;
  privateInputs: MintPrivateInputs;
} {
  const { merkleRoot, inputNote, merkleProof, poolId, tickLower, tickUpper, liquidityDelta, existingPosition, pool, minToken0, minToken1 } = params;
  
  // Compute position commitment
  const ownerKey = deriveOwnerKey(inputNote.spendingKey);
  const nonce = existingPosition?.nonce || 1;
  
  const newPositionCommitment = computePositionCommitment(
    poolId,
    tickLower,
    tickUpper,
    liquidityDelta,
    existingPosition?.feeGrowthInside0Last || 0n,
    existingPosition?.feeGrowthInside1Last || 0n,
    existingPosition?.tokensOwed0 || 0n,
    existingPosition?.tokensOwed1 || 0n,
    ownerKey,
    nonce,
    existingPosition?.blinding || inputNote.blinding
  );
  
  const positionNullifier = computePositionNullifier(
    newPositionCommitment,
    inputNote.spendingKey
  );
  
  // Generate output note commitment (change from mint)
  // In practice, this would be computed from the CLMM math
  const outputNoteCommitment = computeNoteCommitment(
    0, // asset ID
    0n, // amount
    ownerKey,
    inputNote.blinding + 1n
  );
  
  // Slippage commitment (hash of min amounts)
  const minSlippage = hexToField('0x' + minToken0.toString(16).padStart(64, '0') + minToken1.toString(16).padStart(64, '0'));
  
  const publicInputs = generateMintPublicInputs({
    merkleRoot,
    inputNote,
    oldPositionCommitment: existingPosition?.commitment || hexToField('0x'),
    newPositionCommitment,
    positionNullifier,
    poolStateOld: hexToField('0x1'), // Simplified
    poolStateNew: hexToField('0x2'), // Simplified
    outputNoteCommitment,
    minSlippage
  });
  
  const privateInputs = generateMintPrivateInputs({
    inputNote,
    merkleProof,
    poolId,
    tickLower,
    tickUpper,
    liquidityDelta,
    position: existingPosition,
    pool,
    minToken0,
    minToken1
  });
  
  return { publicInputs, privateInputs };
}

/**
 * Export inputs to JSON for Noir circuit
 */
export function exportToJson(inputs: Record<string, unknown>): string {
  const formatValue = (value: unknown): unknown => {
    if (typeof value === 'bigint') {
      return bigIntToField(value);
    }
    if (Array.isArray(value)) {
      return value.map(formatValue);
    }
    return value;
  };
  
  const formatted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    formatted[key] = formatValue(value);
  }
  
  return JSON.stringify(formatted, null, 2);
}

/**
 * Parse public inputs from contract response
 */
export function parsePublicInputs(bytes: Uint8Array): PublicInputs {
  const toField = (offset: number): Field => {
    const slice = bytes.slice(offset, offset + 32);
    return '0x' + Buffer.from(slice).toString('hex');
  };
  
  return {
    merkleRoot: toField(0),
    positionNullifier: toField(32),
    oldPositionCommitment: toField(64),
    newPositionCommitment: toField(96),
    poolStateOldCommitment: toField(128),
    poolStateNewCommitment: toField(160),
    inputNoteNullifier: toField(192),
    outputNoteCommitment: toField(224),
    slippageMinCommitment: toField(256)
  };
}
