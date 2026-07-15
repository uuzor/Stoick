/**
 * Type definitions for Wraith CLMM SDK
 */

// Field element (256-bit scalar on BN254)
export type Field = string; // hex string

// Nullifier - prevents double-spending
export type Nullifier = Field;

// Note commitment - hides note contents
export type Commitment = Field;

// Merkle root - represents current state
export type MerkleRoot = Field;

// Merkle path proof
export interface MerkleProof {
  path: Field[];
  indices: Field[];
}

// Spending key - secret, never revealed
export type SpendingKey = bigint;

// Viewing key - allows reading notes
export type ViewingKey = Field;

// Note representing a balance
export interface Note {
  assetId: number;
  amount: bigint;
  ownerKey: Field;
  spendingKey: SpendingKey;
  blinding: bigint;
  commitment: Commitment;
  nullifier: Nullifier;
  merkleProof?: MerkleProof;
}

// CLMM Position
export interface Position {
  poolId: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  feeGrowthInside0Last: bigint;
  feeGrowthInside1Last: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
  nonce: number;
  blinding: bigint;
  ownerSpendingKey: SpendingKey;
  commitment: Field;
  nullifier: Nullifier;
}

// Pool state
export interface PoolState {
  poolId: number;
  asset0: number;
  asset1: number;
  sqrtPrice: bigint;
  liquidity: bigint;
  currentTick: number;
  feeGrowthGlobal0: bigint;
  feeGrowthGlobal1: bigint;
  protocolFee0: bigint;
  protocolFee1: bigint;
  fee: number;
  tickSpacing: number;
  sequence: bigint;
}

// ZK Proof structure
export interface ZKProof {
  proof: Uint8Array; // 14592 bytes
  publicInputs: Field[];
}

// Circuit types
export type CircuitType = 'mint' | 'burn' | 'swap' | 'collect';

// Transaction result
export interface TransactionResult {
  opId: bigint;
  commitment: Commitment;
  leafIndex?: number;
  newRoot?: MerkleRoot;
}

// Swap result
export interface SwapResult {
  amountIn: bigint;
  amountOut: bigint;
  commitment: Commitment;
}

// Collect result
export interface CollectResult {
  amount0: bigint;
  amount1: bigint;
  commitment: Commitment;
}

// Network configuration
export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  horizonUrl?: string;
}

// Contract addresses
export interface ContractAddresses {
  clmm: string;
  merkleTree: string;
  mintVerifier: string;
  burnVerifier: string;
  swapVerifier: string;
  collectVerifier: string;
}

// Default addresses (testnet)
export const DEFAULT_ADDRESSES: ContractAddresses = {
  clmm: 'CDCD4ZQYUKUUXFUFNFRSXNAQ6YVT2IRIROKRXIIKQIDPBRMK4HZ6TPPW',
  merkleTree: 'CDB5PDVSHDCODSXRXX73GN4AU5USNR5CPTJ6KOIAP6KAGMPQXGQTBCKZ',
  mintVerifier: 'CDROXB3XDEZZ4D2RYMJABKR2CNBN2OW6K2SRQQUQNN5PCEN4UYJ7U35K',
  burnVerifier: 'CACGOW4ABQEREUYWRYY4FKAD2VY2H6ZT53ZQJ4JXFGFTH3QGT2ZTWDPJ',
  swapVerifier: 'CDD4U6GJCORF7O47T5PYK4B7BSHHCZCTIPFN6H66NBQIV6WNP46L4X3OQ',
  collectVerifier: 'CB2GGVSSINHSMQLHGNCVH2CFLLNBHZBDLGMT3PBIM2424CJ4GAUWAT6H',
};

// Testnet configuration
export const TESTNET_CONFIG: NetworkConfig = {
  rpcUrl: 'https://soroban-testnet.stellar.org:443',
  networkPassphrase: 'Test SDF Network ; September 2015',
  horizonUrl: 'https://horizon-testnet.stellar.org',
};

// Publicnet configuration
export const PUBLICNET_CONFIG: NetworkConfig = {
  rpcUrl: 'https://soroban-mainnet.stellar.org:443',
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
};
