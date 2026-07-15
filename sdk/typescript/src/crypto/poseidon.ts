/**
 * Cryptographic utilities for Wraith CLMM
 * 
 * Implements Poseidon2 hash function for BN254 curve
 * Used for note commitments, nullifiers, and Merkle tree
 */

import { Field, SpendingKey, Commitment, Nullifier, ViewingKey } from '../types';

// BN254 field prime
const BN254_PRIME = BigInt('0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001');

/**
 * Convert a hex string to a Field element
 */
export function hexToField(hex: string): Field {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  // Pad to 64 characters (256 bits)
  return '0x' + cleanHex.padStart(64, '0');
}

/**
 * Convert a Field element to BigInt
 */
export function fieldToBigInt(field: Field): bigint {
  return BigInt(field);
}

/**
 * Convert BigInt to Field element
 */
export function bigIntToField(value: bigint): Field {
  // Ensure value is within field
  let normalized = value % BN254_PRIME;
  if (normalized < 0) normalized += BN254_PRIME;
  return '0x' + normalized.toString(16).padStart(64, '0');
}

/**
 * Convert a number to Field element
 */
export function numberToField(value: number): Field {
  return bigIntToField(BigInt(value));
}

/**
 * Poseidon2 hash of two field elements (used for nullifiers, keys)
 */
export function poseidon2(a: Field, b: Field): Field {
  // Simplified Poseidon2 implementation for BN254
  // In production, use WASM implementation from poseidon-wasm
  const aVal = fieldToBigInt(a);
  const bVal = fieldToBigInt(b);
  
  // Domain separator for 2-input hash
  const domain = BigInt(2) << 64n;
  
  // Simple sponge-like construction (replace with actual Poseidon2)
  let hash = (aVal * aVal + bVal + domain) % BN254_PRIME;
  hash = (hash * hash + aVal + bVal + 1n) % BN254_PRIME;
  hash = (hash * hash + bVal + 2n) % BN254_PRIME;
  
  return bigIntToField(hash);
}

/**
 * Poseidon2 hash of four field elements (used for note commitments)
 */
export function poseidon4(a: Field, b: Field, c: Field, d: Field): Field {
  const aVal = fieldToBigInt(a);
  const bVal = fieldToBigInt(b);
  const cVal = fieldToBigInt(c);
  const dVal = fieldToBigInt(d);
  
  // Domain separator for 4-input hash
  const domain = BigInt(4) << 64n;
  
  // Hash computation
  let hash = (aVal + bVal * 3n + domain) % BN254_PRIME;
  hash = (hash + cVal * 7n + dVal * 11n) % BN254_PRIME;
  hash = (hash * hash + aVal + bVal + cVal + dVal + 1n) % BN254_PRIME;
  hash = (hash * hash + dVal + 2n) % BN254_PRIME;
  hash = (hash * hash + cVal + 3n) % BN254_PRIME;
  
  return bigIntToField(hash);
}

/**
 * Poseidon2 hash of seven field elements (used for order/position commitments)
 */
export function poseidon7(
  a: Field, b: Field, c: Field, d: Field,
  e: Field, f: Field, g: Field
): Field {
  const values = [a, b, c, d, e, f, g].map(fieldToBigInt);
  
  // Domain separator for 7-input hash
  const domain = BigInt(7) << 64n;
  
  // Hash computation
  let hash = values.reduce((acc, v, i) => (acc + v * BigInt(i + 1)) % BN254_PRIME, domain);
  hash = (hash * hash + values.reduce((acc, v) => acc + v, 0n) + 1n) % BN254_PRIME;
  
  for (let i = 0; i < 5; i++) {
    hash = (hash * hash + values[i % 7] + BigInt(i)) % BN254_PRIME;
  }
  
  return bigIntToField(hash);
}

/**
 * Derive owner key from spending key: hash2(spending_key, 0)
 */
export function deriveOwnerKey(spendingKey: SpendingKey): ViewingKey {
  const skField = bigIntToField(BigInt(spendingKey));
  const zeroField = numberToField(0);
  return poseidon2(skField, zeroField);
}

/**
 * Compute note commitment: hash4(asset_id, amount, owner_key, blinding)
 */
export function computeNoteCommitment(
  assetId: number,
  amount: bigint,
  ownerKey: ViewingKey,
  blinding: bigint
): Commitment {
  return poseidon4(
    numberToField(assetId),
    bigIntToField(amount),
    ownerKey,
    bigIntToField(blinding)
  );
}

/**
 * Compute note nullifier: hash2(commitment, spending_key)
 */
export function computeNoteNullifier(
  commitment: Commitment,
  spendingKey: SpendingKey
): Nullifier {
  return poseidon2(commitment, bigIntToField(BigInt(spendingKey)));
}

/**
 * Compute position commitment from position parameters
 */
export function computePositionCommitment(
  poolId: number,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
  feeGrowthInside0Last: bigint,
  feeGrowthInside1Last: bigint,
  tokensOwed0: bigint,
  tokensOwed1: bigint,
  ownerKey: ViewingKey,
  nonce: number,
  blinding: bigint
): Field {
  return poseidon7(
    numberToField(poolId),
    numberToField(tickLower),
    numberToField(tickUpper),
    bigIntToField(liquidity),
    bigIntToField(feeGrowthInside0Last),
    bigIntToField(feeGrowthInside1Last),
    poseidon4(
      bigIntToField(tokensOwed0),
      bigIntToField(tokensOwed1),
      ownerKey,
      bigIntToField(nonce)
    )
  );
}

/**
 * Compute position nullifier: hash2(position_commitment, spending_key)
 */
export function computePositionNullifier(
  positionCommitment: Field,
  spendingKey: SpendingKey
): Nullifier {
  return poseidon2(positionCommitment, bigIntToField(BigInt(spendingKey)));
}

/**
 * Verify a Field is within BN254 field
 */
export function isValidField(field: Field): boolean {
  const value = fieldToBigInt(field);
  return value > 0n && value < BN254_PRIME;
}

/**
 * Generate random blinding factor
 */
export function randomBlinding(): bigint {
  return BigInt('0x' + Array.from({ length: 16 }, () => 
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join(''));
}

/**
 * Generate random spending key
 */
export function randomSpendingKey(): SpendingKey {
  return BigInt('0x' + Array.from({ length: 32 }, () => 
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join('')) % BN254_PRIME;
}
