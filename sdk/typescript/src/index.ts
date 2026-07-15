/**
 * Wraith CLMM SDK - Fully Shielded Concentrated Liquidity Market Maker
 * 
 * @example
 * ```typescript
 * import { WraithSDK, generateKeyPair } from '@wraith/clmm-sdk';
 * 
 * // Create key pair
 * const { spendingKey, viewingKey } = generateKeyPair();
 * 
 * // Initialize SDK
 * const sdk = new WraithSDK({
 *   network: 'testnet',
 *   spendingKey,
 *   viewingKey
 * });
 * 
 * // Get pool info
 * const pool = await sdk.getPool(1);
 * 
 * // Create and submit mint transaction
 * const { proof } = await sdk.createMintProof({
 *   poolId: 1,
 *   tickLower: -1000,
 *   tickUpper: 1000,
 *   liquidityDelta: 1000000n,
 *   inputNote: myNote
 * });
 * 
 * const result = await sdk.mint(proof, 1);
 * ```
 */

// Types
export * from './types';

// Crypto utilities
export {
  hexToField,
  fieldToBigInt,
  bigIntToField,
  numberToField,
  poseidon2,
  poseidon4,
  poseidon7,
  deriveOwnerKey,
  computeNoteCommitment,
  computeNoteNullifier,
  computePositionCommitment,
  computePositionNullifier,
  randomBlinding,
  randomSpendingKey,
  isValidField
} from './crypto/poseidon';

export {
  TREE_DEPTH,
  MAX_LEAVES,
  computeZeroHashes,
  computeRoot,
  generateMerkleProof,
  verifyMerkleProof,
  buildMerkleTree,
  getRootFromTree,
  verifyTreeConsistency
} from './crypto/merkle';

export {
  generateKeyPair,
  createNote,
  addMerkleProof,
  verifyNote,
  NoteStore,
  type KeyPair
} from './crypto/notes';

// Circuit inputs
export {
  generateMintWitness,
  generateMintPublicInputs,
  generateMintPrivateInputs,
  parsePublicInputs,
  exportToJson,
  type PublicInputs,
  type MintPrivateInputs
} from './circuits/inputs';

// Contract clients
export { CLMMClient } from './contracts/clmm';

import { CLMMClient } from './contracts/clmm';
import { KeyPair, generateKeyPair, NoteStore, createNote, addMerkleProof } from './crypto/notes';
import { Note, NetworkConfig, TESTNET_CONFIG, PUBLICNET_CONFIG, DEFAULT_ADDRESSES, ContractAddresses, ZKProof } from './types';
import { generateMintWitness } from './circuits/inputs';
import { MerkleProof, Field } from './types';

/**
 * Wraith SDK main class
 */
export class WraithSDK {
  private client: CLMMClient;
  private noteStore: NoteStore;
  private keyPair: KeyPair;
  private network: NetworkConfig;
  private addresses: ContractAddresses;
  
  /**
   * Create a new WraithSDK instance
   */
  constructor(params: {
    network?: 'testnet' | 'publicnet';
    networkConfig?: NetworkConfig;
    addresses?: ContractAddresses;
    spendingKey?: bigint;
    viewingKey?: Field;
  }) {
    // Setup network
    if (params.network === 'testnet') {
      this.network = TESTNET_CONFIG;
    } else if (params.network === 'publicnet') {
      this.network = PUBLICNET_CONFIG;
    } else {
      this.network = params.networkConfig || TESTNET_CONFIG;
    }
    
    this.addresses = params.addresses || DEFAULT_ADDRESSES;
    
    // Setup keys
    if (params.spendingKey && params.viewingKey) {
      this.keyPair = {
        spendingKey: params.spendingKey,
        viewingKey: params.viewingKey
      };
    } else if (params.spendingKey) {
      const { deriveOwnerKey } = require('./crypto/poseidon');
      this.keyPair = {
        spendingKey: params.spendingKey,
        viewingKey: deriveOwnerKey(params.spendingKey)
      };
    } else {
      this.keyPair = generateKeyPair();
    }
    
    // Initialize clients
    this.client = new CLMMClient(this.network, this.addresses, this.keyPair);
    this.noteStore = new NoteStore();
  }
  
  /**
   * Get the spending key (keep secret!)
   */
  getSpendingKey(): bigint {
    return this.keyPair.spendingKey;
  }
  
  /**
   * Get the viewing key (share publicly)
   */
  getViewingKey(): Field {
    return this.keyPair.viewingKey;
  }
  
  /**
   * Get the note store
   */
  getNoteStore(): NoteStore {
    return this.noteStore;
  }
  
  /**
   * Get pool information
   */
  async getPool(poolId: number) {
    return this.client.getPool(poolId);
  }
  
  /**
   * Get current Merkle root
   */
  async getMerkleRoot(): Promise<Field> {
    return this.client.getMerkleRoot();
  }
  
  /**
   * Create a new private note
   */
  createPrivateNote(params: {
    assetId: number;
    amount: bigint;
  }): Note {
    const note = createNote({
      assetId: params.assetId,
      amount: params.amount,
      ownerKey: this.keyPair.viewingKey,
      spendingKey: this.keyPair.spendingKey
    });
    
    this.noteStore.addNote(note);
    return note;
  }
  
  /**
   * Generate ZK proof for minting liquidity
   */
  async createMintProof(params: {
    poolId: number;
    tickLower: number;
    tickUpper: number;
    liquidityDelta: bigint;
    inputNote: Note;
    minToken0?: bigint;
    minToken1?: bigint;
  }): Promise<ZKProof> {
    // Get pool info
    const pool = await this.getPool(params.poolId);
    
    // Get Merkle root
    const merkleRoot = await this.getMerkleRoot();
    
    // Get all commitments for Merkle proof
    const allCommitments = this.noteStore.getAllNotes().map(n => n.commitment);
    
    // Find our note's index
    const noteIndex = allCommitments.indexOf(params.inputNote.commitment);
    if (noteIndex === -1) {
      throw new Error('Input note not found in note store');
    }
    
    // Generate Merkle proof
    const { generateMerkleProof } = require('./crypto/merkle');
    const merkleProof = generateMerkleProof(allCommitments, noteIndex);
    
    // Add proof to note
    const noteWithProof = addMerkleProof(params.inputNote, allCommitments, noteIndex);
    
    // Generate witness
    const { publicInputs, privateInputs } = generateMintWitness({
      merkleRoot,
      inputNote: noteWithProof,
      merkleProof,
      poolId: params.poolId,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      liquidityDelta: params.liquidityDelta,
      existingPosition: null, // TODO: Look up existing position
      pool: {
        ...pool,
        feeGrowthGlobal0: 0n,
        feeGrowthGlobal1: 0n,
        protocolFee0: 0n,
        protocolFee1: 0n,
        sequence: 0n
      },
      minToken0: params.minToken0 || 0n,
      minToken1: params.minToken1 || 0n
    });
    
    // In production, this would call the prover
    // For now, return placeholder
    const proofBytes = new Uint8Array(14592);
    
    return {
      proof: proofBytes,
      publicInputs: Object.values(publicInputs)
    };
  }
  
  /**
   * Submit mint transaction
   */
  async mint(proof: ZKProof, poolId: number) {
    return this.client.mint({ proof, poolId });
  }
  
  /**
   * Submit burn transaction
   */
  async burn(proof: ZKProof, poolId: number) {
    return this.client.burn({ proof, poolId });
  }
  
  /**
   * Submit swap transaction
   */
  async swap(proof: ZKProof, poolId: number) {
    return this.client.swap({ proof, poolId });
  }
  
  /**
   * Submit collect transaction
   */
  async collect(proof: ZKProof, poolId: number) {
    return this.client.collect({ proof, poolId });
  }
  
  /**
   * Get balance for an asset
   */
  getBalance(assetId: number): bigint {
    return this.noteStore.getBalance(assetId);
  }
  
  /**
   * Export notes to JSON
   */
  exportNotes(): string {
    return this.noteStore.export();
  }
  
  /**
   * Import notes from JSON
   */
  importNotes(json: string): void {
    this.noteStore.import(json);
  }
}

/**
 * Create a Wraith SDK instance from mnemonic
 */
export async function fromMnemonic(
  mnemonic: string,
  params?: {
    network?: 'testnet' | 'publicnet';
    addresses?: ContractAddresses;
  }
): Promise<WraithSDK> {
  // In production, derive key from mnemonic
  // For now, generate random key
  const { generateKeyPair } = require('./crypto/notes');
  const keys = generateKeyPair();
  
  return new WraithSDK({
    network: params?.network || 'testnet',
    addresses: params?.addresses,
    spendingKey: keys.spendingKey,
    viewingKey: keys.viewingKey
  });
}
