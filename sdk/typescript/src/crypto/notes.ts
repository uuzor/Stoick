/**
 * Note management utilities for Wraith CLMM
 * 
 * Handles note creation, storage, and spending
 */

import {
  Note,
  SpendingKey,
  ViewingKey,
  Commitment,
  Nullifier,
  MerkleProof,
  MerkleRoot
} from '../types';
import {
  deriveOwnerKey,
  computeNoteCommitment,
  computeNoteNullifier,
  randomBlinding,
  hexToField
} from './poseidon';
import { generateMerkleProof, verifyMerkleProof } from './merkle';

/**
 * Key pair for a user
 */
export interface KeyPair {
  spendingKey: SpendingKey;
  viewingKey: ViewingKey;
}

/**
 * Create a new key pair
 */
export function generateKeyPair(): KeyPair {
  // Generate random spending key
  const spendingKey = BigInt('0x' + 
    Array.from({ length: 32 }, () => 
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('')
  );
  
  const viewingKey = deriveOwnerKey(spendingKey);
  
  return { spendingKey, viewingKey };
}

/**
 * Create a note for minting
 */
export function createNote(params: {
  assetId: number;
  amount: bigint;
  ownerKey: ViewingKey;
  spendingKey: SpendingKey;
}): Note {
  const { assetId, amount, ownerKey, spendingKey } = params;
  
  // Generate random blinding
  const blinding = randomBlinding();
  
  // Compute commitment
  const commitment = computeNoteCommitment(assetId, amount, ownerKey, blinding);
  
  // Compute nullifier
  const nullifier = computeNoteNullifier(commitment, spendingKey);
  
  return {
    assetId,
    amount,
    ownerKey,
    spendingKey,
    blinding,
    commitment,
    nullifier,
    merkleProof: undefined
  };
}

/**
 * Add Merkle proof to a note
 */
export function addMerkleProof(
  note: Note,
  allCommitments: Commitment[],
  leafIndex: number
): Note & { merkleProof: MerkleProof } {
  const proof = generateMerkleProof(allCommitments, leafIndex);
  
  return {
    ...note,
    merkleProof: proof
  };
}

/**
 * Verify note is valid and belongs to owner
 */
export function verifyNote(note: Note, merkleRoot: MerkleRoot): boolean {
  // Verify commitment matches
  const expectedCommitment = computeNoteCommitment(
    note.assetId,
    note.amount,
    note.ownerKey,
    note.blinding
  );
  
  if (expectedCommitment !== note.commitment) {
    return false;
  }
  
  // Verify nullifier matches
  const expectedNullifier = computeNoteNullifier(note.commitment, note.spendingKey);
  
  if (expectedNullifier !== note.nullifier) {
    return false;
  }
  
  // Verify Merkle proof if present
  if (note.merkleProof) {
    return verifyMerkleProof(note.commitment, merkleRoot, note.merkleProof);
  }
  
  return true;
}

/**
 * Note database for local storage
 */
export class NoteStore {
  private notes: Map<string, Note> = new Map();
  private spentNullifiers: Set<string> = new Set();
  
  /**
   * Add a note to the store
   */
  addNote(note: Note): void {
    // Store by commitment
    this.notes.set(note.commitment, note);
    // DO NOT add nullifier here - it's spent only after a successful burn
  }
  
  /**
   * Get a note by commitment
   */
  getNote(commitment: string): Note | undefined {
    return this.notes.get(commitment);
  }
  
  /**
   * Get all notes for an asset
   */
  getNotesByAsset(assetId: number): Note[] {
    return Array.from(this.notes.values()).filter(n => n.assetId === assetId);
  }
  
  /**
   * Get all notes
   */
  getAllNotes(): Note[] {
    return Array.from(this.notes.values());
  }
  
  /**
   * Check if a note has been spent
   */
  isSpent(nullifier: string): boolean {
    return this.spentNullifiers.has(nullifier);
  }
  
  /**
   * Mark a note as spent (after successful burn)
   */
  markSpent(nullifier: string): void {
    this.spentNullifiers.add(nullifier);
  }
  
  /**
   * Remove a note from the store
   */
  removeNote(commitment: string): Note | undefined {
    const note = this.notes.get(commitment);
    if (note) {
      this.notes.delete(commitment);
    }
    return note;
  }
  
  /**
   * Get total balance for an asset
   */
  getBalance(assetId: number): bigint {
    return this.getNotesByAsset(assetId)
      .filter(n => !this.spentNullifiers.has(n.nullifier))
      .reduce((sum, n) => sum + n.amount, 0n);
  }
  
  /**
   * Export notes to JSON
   */
  export(): string {
    return JSON.stringify({
      notes: Array.from(this.notes.values()).map(n => ({
        ...n,
        amount: n.amount.toString(),
        spendingKey: n.spendingKey.toString(),
        blinding: n.blinding.toString()
      }))
    });
  }
  
  /**
   * Import notes from JSON
   */
  import(json: string): void {
    const data = JSON.parse(json);
    for (const n of data.notes) {
      this.addNote({
        ...n,
        amount: BigInt(n.amount),
        spendingKey: BigInt(n.spendingKey),
        blinding: BigInt(n.blinding)
      });
    }
  }
}
