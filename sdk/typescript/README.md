# Wraith CLMM TypeScript SDK

Fully Shielded Concentrated Liquidity Market Maker SDK for Stellar

## Installation

```bash
npm install @wraith/clmm-sdk
```

## Quick Start

```typescript
import { WraithSDK, generateKeyPair } from '@wraith/clmm-sdk';

// Create key pair
const { spendingKey, viewingKey } = generateKeyPair();

// Initialize SDK
const sdk = new WraithSDK({
  network: 'testnet',
  spendingKey,
  viewingKey
});

// Get pool info
const pool = await sdk.getPool(1);
console.log('Pool liquidity:', pool.liquidity);

// Create a private note
const note = sdk.createPrivateNote({
  assetId: 0,
  amount: 1000000n
});

// Generate ZK proof for minting liquidity
const proof = await sdk.createMintProof({
  poolId: 1,
  tickLower: -1000,
  tickUpper: 1000,
  liquidityDelta: 1000000n,
  inputNote: note,
  minToken0: 0n,
  minToken1: 0n
});

// Submit mint transaction
const result = await sdk.mint(proof, 1);
console.log('Minted! Op ID:', result.opId);
```

## Features

### Privacy-First Design
- **Note commitments** hide all transaction amounts
- **Nullifiers** prevent double-spending without revealing identity
- **Merkle proofs** verify note validity without disclosure

### Full CLMM Support
- **Concentrated liquidity** for capital efficiency
- **Tick-based positioning** for price control
- **Fee accumulation** automatically reinvested

### Developer Experience
- **TypeScript** for type safety
- **Promise-based API** for async operations
- **Local note storage** for wallet integration

## Core Concepts

### Notes
A note represents a private balance:

```typescript
interface Note {
  assetId: number;      // Asset identifier
  amount: bigint;       // Balance amount
  ownerKey: ViewingKey; // Public key for verification
  spendingKey: bigint;  // Secret key for spending
  commitment: Field;    // Hash hiding note contents
  nullifier: Field;     // Unique identifier for spending
}
```

### Key Derivation
```
Spending Key → Owner Key: hash2(spending_key, 0)
Note Commitment: hash4(asset_id, amount, owner_key, blinding)
Note Nullifier: hash2(commitment, spending_key)
```

### ZK Proof Flow
```
1. User creates note locally
2. User generates ZK proof (client-side)
3. User submits proof to CLMM contract
4. Contract verifies proof on-chain
5. Contract inserts commitment into Merkle tree
6. Transaction complete!
```

## API Reference

### WraithSDK

Main SDK class for interacting with Wraith CLMM.

#### Constructor
```typescript
new WraithSDK(params: {
  network?: 'testnet' | 'publicnet';
  networkConfig?: NetworkConfig;
  addresses?: ContractAddresses;
  spendingKey?: bigint;
  viewingKey?: Field;
})
```

#### Methods

##### `getSpendingKey(): bigint`
Get the spending key (keep secret!).

##### `getViewingKey(): Field`
Get the viewing key (can be shared).

##### `getPool(poolId: number): Promise<PoolState>`
Get pool information by ID.

##### `getMerkleRoot(): Promise<Field>`
Get current Merkle root.

##### `createPrivateNote(params): Note`
Create a new private note.

##### `createMintProof(params): Promise<ZKProof>`
Generate ZK proof for minting liquidity.

##### `mint(proof, poolId): Promise<TransactionResult>`
Submit mint transaction.

##### `burn(proof, poolId): Promise<TransactionResult>`
Submit burn transaction.

##### `swap(proof, poolId): Promise<SwapResult>`
Submit swap transaction.

##### `collect(proof, poolId): Promise<CollectResult>`
Submit collect fees transaction.

##### `getBalance(assetId: number): bigint`
Get total balance for an asset.

### NoteStore

Local storage for notes.

```typescript
const store = new NoteStore();

// Add a note
store.addNote(note);

// Get notes by asset
const notes = store.getNotesByAsset(0);

// Check if spent
const spent = store.isSpent(nullifier);

// Get balance
const balance = store.getBalance(0);

// Export/Import
const json = store.export();
store.import(json);
```

## Contract Addresses

### Testnet
| Contract | Address |
|----------|---------|
| CLMM | `CDCD4ZQYUKUUXFUFNFRSXNAQ6YVT2IRIROKRXIIKQIDPBRMK4HZ6TPPW` |
| Merkle Tree | `CDB5PDVSHDCODSXRXX73GN4AU5USNR5CPTJ6KOIAP6KAGMPQXGQTBCKZ` |
| Mint Verifier | `CDROXB3XDEZZ4D2RYMJABKR2CNBN2OW6K2SRQQUQNN5PCEN4UYJ7U35K` |
| Burn Verifier | `CACGOW4ABQEREUYWRYY4FKAD2VY2H6ZT53ZQJ4JXFGFTH3QGT2ZTWDPJ` |
| Swap Verifier | `CDD4U6GJCORF7O47T5PYK4B7BSHHCZCTIPFN6H66NBQIV6WNP46L4X3OQ` |
| Collect Verifier | `CB2GGVSSINHSMQLHGNCVH2CFLLNBHZBDLGMT3PBIM2424CJ4GAUWAT6H` |

## Building

```bash
cd sdk/typescript
npm install
npm run build
```

## Testing

```bash
npm test
```

## License

MIT
