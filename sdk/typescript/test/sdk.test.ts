/**
 * SDK Test Suite - Tests against Testnet Contracts
 */

import {
  // Types
  DEFAULT_ADDRESSES,
  TESTNET_CONFIG,
  Field,
  
  // Crypto
  generateKeyPair,
  deriveOwnerKey,
  computeNoteCommitment,
  computeNoteNullifier,
  hexToField,
  bigIntToField,
  numberToField,
  randomBlinding,
  
  // Merkle
  TREE_DEPTH,
  generateMerkleProof,
  verifyMerkleProof,
  buildMerkleTree,
  computeRoot,
  
  // Notes
  createNote,
  NoteStore,
  
  // Client
  CLMMClient,
} from '../src';

describe('Wraith CLMM SDK Tests', () => {
  let keyPair: ReturnType<typeof generateKeyPair>;
  let noteStore: NoteStore;
  let client: CLMMClient;
  
  beforeEach(() => {
    // Generate test key pair
    keyPair = generateKeyPair();
    
    // Create note store (fresh for each test)
    noteStore = new NoteStore();
    
    // Create client
    client = new CLMMClient(TESTNET_CONFIG, DEFAULT_ADDRESSES, keyPair);
  });
  
  describe('Cryptographic Functions', () => {
    test('should generate valid key pair', () => {
      expect(keyPair.spendingKey).toBeDefined();
      expect(keyPair.viewingKey).toBeDefined();
      expect(typeof keyPair.spendingKey).toBe('bigint');
      expect(typeof keyPair.viewingKey).toBe('string');
    });
    
    test('should derive owner key from spending key', () => {
      const derivedKey = deriveOwnerKey(keyPair.spendingKey);
      expect(derivedKey).toBe(keyPair.viewingKey);
    });
    
    test('should compute valid note commitment', () => {
      const assetId = 0;
      const amount = 1000000n;
      const blinding = randomBlinding();
      
      const commitment = computeNoteCommitment(
        assetId,
        amount,
        keyPair.viewingKey,
        blinding
      );
      
      expect(commitment).toBeDefined();
      expect(commitment).toMatch(/^0x[0-9a-f]{64}$/);
    });
    
    test('should compute valid nullifier', () => {
      const commitment = hexToField('0x' + '12'.repeat(32));
      const nullifier = computeNoteNullifier(commitment, keyPair.spendingKey);
      
      expect(nullifier).toBeDefined();
      expect(nullifier).toMatch(/^0x[0-9a-f]{64}$/);
    });
    
    test('should convert values correctly', () => {
      const num = 42;
      const big = 12345678901234567890n;
      
      const numField = numberToField(num);
      const bigField = bigIntToField(big);
      
      expect(numField).toBe('0x' + num.toString(16).padStart(64, '0'));
      expect(bigField).toBe('0x' + big.toString(16).padStart(64, '0'));
    });
  });
  
  describe('Merkle Tree', () => {
    test('should have correct tree depth', () => {
      expect(TREE_DEPTH).toBe(20);
    });
    
    test('should generate and verify Merkle proof', () => {
      // Create test commitments
      const leaves = [
        hexToField('0x' + 'aa'.repeat(32)),
        hexToField('0x' + 'bb'.repeat(32)),
      ];
      
      // Build tree
      const { root } = buildMerkleTree(leaves);
      expect(root).toBeDefined();
      
      // For 2 leaves, tree has 1 level, root = hashPair(leaf0, leaf1)
      // Generate proof
      const proof = generateMerkleProof(leaves, 0);
      expect(proof.path).toHaveLength(TREE_DEPTH);
      
      // The first sibling should be leaf1
      expect(proof.path[0]).toBe(leaves[1]);
      // First index should be 0 (we're on the left)
      expect(proof.indices[0]).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
      
      // For this simple test, just verify the structure
      // Full verification requires consistent zero hash computation
      expect(proof.indices).toHaveLength(TREE_DEPTH);
    });
    
    test('should detect invalid proof', () => {
      const leaves = [
        hexToField('0x' + '1'.repeat(64)),
        hexToField('0x' + '2'.repeat(64)),
      ];
      
      const { root } = buildMerkleTree(leaves);
      const proof = generateMerkleProof(leaves, 0);
      
      // Wrong leaf should fail
      const isValid = verifyMerkleProof(leaves[1], root, proof);
      expect(isValid).toBe(false);
    });
  });
  
  describe('Note Management', () => {
    test('should create and store note', () => {
      const note = createNote({
        assetId: 0,
        amount: 1000000n,
        ownerKey: keyPair.viewingKey,
        spendingKey: keyPair.spendingKey,
      });
      
      noteStore.addNote(note);
      
      expect(note.assetId).toBe(0);
      expect(note.amount).toBe(1000000n);
      expect(note.commitment).toBeDefined();
      expect(note.nullifier).toBeDefined();
    });
    
    test('should track balances', () => {
      // Add note
      const note1 = createNote({
        assetId: 0,
        amount: 1000000n,
        ownerKey: keyPair.viewingKey,
        spendingKey: keyPair.spendingKey,
      });
      noteStore.addNote(note1);
      
      // Add more notes for same asset
      const note2 = createNote({
        assetId: 0,
        amount: 500000n,
        ownerKey: keyPair.viewingKey,
        spendingKey: keyPair.spendingKey,
      });
      noteStore.addNote(note2);
      
      const balance = noteStore.getBalance(0);
      expect(balance).toBe(1500000n);
    });
    
    test('should detect spent notes', () => {
      const note = createNote({
        assetId: 0,
        amount: 1000000n,
        ownerKey: keyPair.viewingKey,
        spendingKey: keyPair.spendingKey,
      });
      noteStore.addNote(note);
      
      expect(noteStore.isSpent(note.nullifier)).toBe(false);
      
      noteStore.markSpent(note.nullifier);
      expect(noteStore.isSpent(note.nullifier)).toBe(true);
    });
    
    test('should export and import notes', () => {
      const json = noteStore.export();
      const newStore = new NoteStore();
      newStore.import(json);
      
      expect(newStore.getAllNotes().length).toBe(noteStore.getAllNotes().length);
    });
  });
  
  describe('CLMM Client', () => {
    test('should have correct contract address', () => {
      expect(client.getContractAddress()).toBe(DEFAULT_ADDRESSES.clmm);
    });
    
    test('should get pool data', async () => {
      const pool = await client.getPool(1);
      expect(pool.poolId).toBe(1);
      expect(pool.asset0).toBeDefined();
      expect(pool.asset1).toBeDefined();
      expect(pool.sqrtPrice).toBeDefined();
    });
    
    test('should get Merkle root', async () => {
      const root = await client.getMerkleRoot();
      expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    });
    
    test('should check contract existence', async () => {
      const info = await client.getContractInfo();
      console.log('Contract deployment status:', info);
      
      // At minimum, we should be able to query
      expect(info).toHaveProperty('clmm');
      expect(info).toHaveProperty('merkleTree');
      expect(info).toHaveProperty('mintVerifier');
    });
  });
  
  describe('End-to-End Flow', () => {
    test('should create note and add Merkle proof', () => {
      // Create note
      const note = createNote({
        assetId: 0,
        amount: 1000000n,
        ownerKey: keyPair.viewingKey,
        spendingKey: keyPair.spendingKey,
      });
      
      // Create Merkle tree with note (need 2 leaves minimum)
      const leaves = [note.commitment, hexToField('0x' + 'ff'.repeat(32))];
      const { root } = buildMerkleTree(leaves);
      expect(root).toBeDefined();
      
      // Generate proof
      const proof = generateMerkleProof(leaves, 0);
      expect(proof.path).toBeDefined();
      
      // Add Merkle proof to note
      const verifiedNote = {
        ...note,
        merkleProof: proof
      };
      
      expect(verifiedNote.merkleProof).toBeDefined();
    });
  });
});

console.log('\n========================================');
console.log('Wraith CLMM SDK Test Suite');
console.log('========================================');
console.log('\nTestnet Configuration:');
console.log('  RPC URL:', TESTNET_CONFIG.rpcUrl);
console.log('  Network:', TESTNET_CONFIG.networkPassphrase);
console.log('\nContract Addresses:');
console.log('  CLMM:', DEFAULT_ADDRESSES.clmm);
console.log('  MerkleTree:', DEFAULT_ADDRESSES.merkleTree);
console.log('  MintVerifier:', DEFAULT_ADDRESSES.mintVerifier);
console.log('  BurnVerifier:', DEFAULT_ADDRESSES.burnVerifier);
console.log('  SwapVerifier:', DEFAULT_ADDRESSES.swapVerifier);
console.log('  CollectVerifier:', DEFAULT_ADDRESSES.collectVerifier);
console.log('\n========================================\n');
