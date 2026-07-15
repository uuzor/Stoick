/**
 * Merkle Tree utilities for Wraith CLMM
 * 
 * Provides Merkle proof generation and verification
 * for note commitment membership proofs
 */

import { Field, MerkleProof, MerkleRoot, Commitment } from '../types';
import { poseidon2, hexToField, fieldToBigInt, bigIntToField } from './poseidon';

// Tree depth - matches circuit and contract
export const TREE_DEPTH = 20;

// Maximum leaves (2^20)
export const MAX_LEAVES = BigInt(1) << BigInt(TREE_DEPTH);

/**
 * Compute hash pair (Merkle node)
 */
function hashPair(left: Field, right: Field): Field {
  return poseidon2(left, right);
}

/**
 * Compute zero hash at each level (for sparse Merkle tree)
 */
export function computeZeroHashes(): Field[] {
  const zeroHashes: Field[] = [];
  let current = hexToField('0x0000000000000000000000000000000000000000000000000000000000000000');
  
  for (let i = 0; i <= TREE_DEPTH; i++) {
    zeroHashes.push(current);
    current = hashPair(current, current);
  }
  
  return zeroHashes;
}

/**
 * Compute Merkle root from leaf and path
 */
export function computeRoot(leaf: Field, path: Field[], indices: Field[]): Field {
  let current = leaf;
  const zeroHashes = computeZeroHashes();
  
  for (let i = 0; i < TREE_DEPTH; i++) {
    const index = fieldToBigInt(indices[i]);
    const sibling = path[i];
    
    if (index === 0n) {
      // Leaf is on the left
      current = hashPair(current, sibling);
    } else {
      // Leaf is on the right
      current = hashPair(sibling, current);
    }
  }
  
  return current;
}

/**
 * Generate Merkle proof for a leaf at given index
 */
export function generateMerkleProof(
  leaves: Field[],
  index: number
): MerkleProof {
  const path: Field[] = [];
  const indices: Field[] = [];
  const zeroHashes = computeZeroHashes();
  
  let currentIndex = index;
  
  for (let level = 0; level < TREE_DEPTH; level++) {
    // Sibling index
    const siblingIndex = currentIndex % 2 === 0 
      ? currentIndex + 1 
      : currentIndex - 1;
    
    // Get sibling (or zero hash if doesn't exist)
    const sibling = leaves[siblingIndex] || zeroHashes[level];
    path.push(sibling);
    indices.push(bigIntToField(currentIndex % 2 === 0 ? 0 : 1));
    
    // Move to parent
    currentIndex = Math.floor(currentIndex / 2);
  }
  
  return { path, indices };
}

/**
 * Verify Merkle proof
 */
export function verifyMerkleProof(
  leaf: Field,
  root: Field,
  proof: MerkleProof
): boolean {
  const computedRoot = computeRoot(leaf, proof.path, proof.indices);
  return computedRoot === root;
}

/**
 * Build Merkle tree from leaves and compute root
 */
export function buildMerkleTree(leaves: Field[]): {
  root: Field;
  tree: Field[][];
} {
  const zeroHashes = computeZeroHashes();
  let currentLevel = [...leaves];
  const tree: Field[][] = [currentLevel];
  
  // Pad to power of 2
  while (currentLevel.length < MAX_LEAVES) {
    currentLevel.push(zeroHashes[0]);
  }
  
  // Build tree from bottom up
  while (currentLevel.length > 1) {
    const nextLevel: Field[] = [];
    
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1] || zeroHashes[tree.length - 1];
      nextLevel.push(hashPair(left, right));
    }
    
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }
  
  return {
    root: currentLevel[0],
    tree
  };
}

/**
 * Get root from tree
 */
export function getRootFromTree(tree: Field[][]): Field {
  return tree[tree.length - 1][0];
}

/**
 * Verify root is consistent with tree
 */
export function verifyTreeConsistency(leaves: Field[], root: Field): boolean {
  const { root: computedRoot } = buildMerkleTree(leaves);
  return computedRoot === root;
}
