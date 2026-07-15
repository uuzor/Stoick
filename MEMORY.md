# Stoick Repository - Development Memory

## Overview
This repository contains a **Fully Shielded Concentrated Liquidity Market Maker (CLMM)** for Stellar, using zero-knowledge proofs for privacy.

## Project Structure
```
Stoick/
├── contracts/                    # Soroban smart contracts
│   ├── clmm/                     # Main CLMM contract
│   ├── merkle_tree/              # Merkle tree for note commitments
│   ├── verifier/                 # UltraHonk ZK verifier (uses rs-soroban-ultrahonk)
│   ├── wraith-pool/              # Pool management
│   ├── wraith-bridge/            # Bridge functionality
│   ├── bridge-mpt/              # Merkle Proof Trees for bridge
│   └── faucet-token/            # Test token
├── circuits/                     # Noir ZK circuits
│   └── noir/
│       ├── clmm_mint/           # Mint liquidity circuit
│       ├── clmm_burn/            # Burn liquidity circuit
│       ├── clmm_swap_exact_in/   # Swap circuit
│       ├── clmm_swap_exact_out/  # Swap circuit (exact out)
│       ├── clmm_collect/          # Collect fees circuit
│       ├── withdraw/             # Withdraw circuit
│       ├── transfer/             # Transfer circuit
│       ├── match_orders/         # Order matching circuit
│       └── cancel_order/         # Cancel order circuit
├── docs/
│   ├── ZK_SETUP.md              # ZK proof setup guide
│   ├── architecture/            # Architecture docs
│   └── privacy-model/           # Privacy analysis
└── scripts/
    └── test_clmm_flow.sh        # Integration test script
```

## Contract Addresses (Testnet)

### Primary Contracts
| Contract | Address | Purpose |
|----------|---------|---------|
| **CLMM** | `CDCD4ZQYUKUUXFUFNFRSXNAQ6YVT2IRIROKRXIIKQIDPBRMK4HZ6TPPW` | Main CLMM with ZK verification |
| **Merkle Tree** | `CDB5PDVSHDCODSXRXX73GN4AU5USNR5CPTJ6KOIAP6KAGMPQXGQTBCKZ` | Note commitment storage |
| **Admin** | `GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y` | Admin account |

### Verifier Contracts
| Verifier | Address | Circuit | VK Size |
|----------|---------|---------|---------|
| **Mint** | `CDROXB3XDEZZ4D2RYMJABKR2CNBN2OW6K2SRQQUQNN5PCEN4UYJ7U35K` | clmm_mint | 1760 B |
| **Burn** | `CACGOW4ABQEREUYWRYY4FKAD2VY2H6ZT53ZQJ4JXFGFTH3QGT2ZTWDPJ` | clmm_burn | 1760 B |
| **Collect** | `CB2GGVSSINHSMQLHGNCVH2CFLLNBHZBDLGMT3PBIM2424CJ4GAUWAT6H` | clmm_collect | 1760 B |
| **Swap** | `CDDFCTXVKCG4FSZX3ZMNDQFCD6AHAPSR2PR4Z36HEIJA2FRRGE6Y5SUJ` | clmm_swap_exact_in | 1760 B |

### Legacy/Testing
| Contract | Address | Purpose |
|----------|---------|---------|
| **Withdraw Verifier** | `CBTDPDHITGHVHPRWVYYCNANUY2WOJT2KCAA4NFDHWWYVHTIJVFPOQAZE` | Testing with withdraw circuit |

## Proof Generation

### Noir Circuit Compilation
```bash
# Compile all CLMM circuits
cd circuits/noir/clmm_mint && nargo compile --force
cd circuits/noir/clmm_burn && nargo compile --force
cd circuits/noir/clmm_swap_exact_in && nargo compile --force
cd circuits/noir/clmm_collect && nargo compile --force
```

### Generate Proof
```bash
cd circuits/noir/clmm_mint
nargo execute witness

# This creates:
# - proofs/proof.bin (14592 bytes)
# - target/public_inputs.json (160 bytes)
```

### Proof Format
- **Proof size**: 14592 bytes
- **Public inputs**: 160 bytes (5 fields × 32 bytes each)
- **Public inputs format**: `[merkle_root(32), nullifier(32), commitment(32), ...]`

## Contract Deployment Commands

### Deploy Verifier (with VK)
```bash
# Get VK from compiled circuit
VK=$(cat target/vk)

# Deploy verifier
stellar contract deploy \
  --wasm target/wasm32v1-none/release/verifier.wasm \
  --source-account wraith-clmm \
  --network testnet \
  -- --vk_bytes $VK
```

### Deploy Merkle Tree
```bash
stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/merkle_tree.wasm \
  --source-account wraith-clmm \
  --network testnet \
  -- --admin GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y
```

### Deploy CLMM
```bash
stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/clmm.wasm \
  --source-account wraith-clmm \
  --network testnet \
  -- \
  --admin GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y \
  --mint_vf CDROXB3XDEZZ4D2RYMJABKR2CNBN2OW6K2SRQQUQNN5PCEN4UYJ7U35K \
  --burn_vf CACGOW4ABQEREUYWRYY4FKAD2VY2H6ZT53ZQJ4JXFGFTH3QGT2ZTWDPJ \
  --swap_vf CDDFCTXVKCG4FSZX3ZMNDQFCD6AHAPSR2PR4Z36HEIJA2FRRGE6Y5SUJ \
  --collect_vf CB2GGVSSINHSMQLHGNCVH2CFLLNBHZBDLGMT3PBIM2424CJ4GAUWAT6H \
  --merkle_tree CDB5PDVSHDCODSXRXX73GN4AU5USNR5CPTJ6KOIAP6KAGMPQXGQTBCKZ
```

## Verifier Contract Interface

The verifier uses `rs-soroban-ultrahonk` from Nethermind:

```rust
// contracts/verifier/src/lib.rs
pub use rs_soroban_ultrahonk::UltraHonkVerifierContract;

// Functions:
// __constructor(env, vk_bytes) -> Initialize with verification key
// vk_bytes(env) -> Get stored VK for audit
// verify_proof(env, public_inputs, proof_bytes) -> Verify ZK proof
```

### What verify_proof() Does
1. Parse proof bytes (14592 bytes)
2. Validate public inputs length (160 bytes / 5 fields)
3. Generate Fiat-Shamir challenges (Oink rounds)
4. Compute public_inputs_delta (grand-product permutation)
5. Run sumcheck verification
6. Run Shplemini batch-opening (Gemini + Shplonk + KZG pairing)

## CLMM Contract Interface

### Constructor
```rust
pub fn __constructor(
    env: Env,
    admin: Address,
    mint_vf: Address,      // Mint verifier address
    burn_vf: Address,       // Burn verifier address
    swap_vf: Address,      // Swap verifier address
    collect_vf: Address,   // Collect verifier address
    merkle_tree: Address,   // Merkle tree for note commitments
)
```

### Shielded Operations
```rust
// Add liquidity with ZK proof
mint(proof: Bytes, public_inputs: Bytes, pool_id: u32) -> (u64, BytesN<32>)
// Returns: (op_id, note_commitment)

// Remove liquidity with ZK proof
burn(proof: Bytes, public_inputs: Bytes, pool_id: u32) -> (u64, BytesN<32>)
// Returns: (op_id, nullifier)

// Swap with ZK proof
swap(proof: Bytes, public_inputs: Bytes, pool_id: u32) -> (u64, BytesN<32>)
// Returns: (output_amount, output_commitment)

// Collect fees with ZK proof
collect(proof: Bytes, public_inputs: Bytes, pool_id: u32) -> (u64, u64, BytesN<32>)
// Returns: (amount_0, amount_1, output_commitment)
```

### Public Operations (for testing)
```rust
mint_public(pool_id, owner, tick_lower, tick_upper, amount, min_amount_0, min_amount_1)
burn_public(pool_id, owner, tick_lower, tick_upper, amount)
swap_public(pool_id, amount_in, min_amount_out, zero_for_one)
collect_public(pool_id, owner, tick_lower, tick_upper)
```

### Query Functions
```rust
get_pool(pool_id) -> PoolState
get_position(pool_id, tick_lower, tick_upper) -> PositionState
get_pool_sequence(pool_id) -> u64
get_note_commitment(op_id) -> Option<BytesN<32>>
get_merkle_tree() -> Option<Address>
```

## Merkle Tree Contract Interface

```rust
// Initialize with admin
__constructor(env, admin: Address)

// Insert a note commitment
insert(admin: Address, leaf: BytesN<32>) -> (u32, BytesN<32>)
// Returns: (leaf_index, new_root)

// Batch insert
batch_insert(admin: Address, leaves: Vec<BytesN<32>>) -> (u32, BytesN<32>)

// Query
get_root() -> BytesN<32>
get_leaf_count() -> u32
get_leaf(index: u32) -> Option<BytesN<32>>

// Verification
verify_proof(leaf: BytesN<32>, root: BytesN<32>, proof_path: Vec<(BytesN<32>, bool)>) -> bool
```

## Integration Test Script

```bash
bash scripts/test_clmm_flow.sh
```

Tests the complete flow:
1. Create Pool
2. Add Liquidity (mint with ZK proof → Merkle tree)
3. Swap (swap with ZK proof → Merkle tree)
4. Remove Liquidity (burn with ZK proof)
5. Collect Fees (collect with ZK proof → Merkle tree)

## Build Commands

```bash
# Build all contracts
cd contracts
cargo build --target wasm32v1-none --release

# Build specific contract
cargo build --target wasm32v1-none --release -p clmm
cargo build --target wasm32v1-none --release -p merkle_tree
cargo build --target wasm32v1-none --release -p verifier

# Build Noir circuits
cd circuits/noir/clmm_mint && nargo compile --force
```

## Key Dependencies

### Rust Crates
- `soroban-sdk` = "26.0.0" or "26.1.0"
- `rs-soroban-ultrahonk` from https://github.com/NethermindEth/rs-soroban-ultrahonk
- `soroban-poseidon` for Poseidon hashing

### Noir Version
- Uses `nargo` for circuit compilation
- Proof system: UltraHonk (from Aztec)

## Git History (Recent)

| Commit | Description |
|--------|-------------|
| `3d63a03` | feat: Complete CLMM with real verifier integration |
| `17945e9` | feat: Complete CLMM business logic with Merkle tree integration |
| `07f3baa` | docs: Update ZK_SETUP.md with Merkle Tree contract |
| `178b30f` | feat: Add Merkle Tree contract for note commitments |
| `b2fbaca` | feat: Integrate rs-soroban-ultrahonk for real on-chain verification |

## Important Notes

1. **Verifier VK is Immutable**: Once deployed, the verification key cannot be changed. VK is validated at constructor time.

2. **Proof Format**: Real proofs are 14592 bytes generated by Noir circuits. Mock proofs will fail verification.

3. **Merkle Tree Height**: Currently set to 20 (supports ~1 million leaves).

4. **Cross-Contract Calls**: CLMM calls verifiers using `env.invoke_contract()` with the `verify_proof` function.

5. **Public vs Shielded**: The CLMM supports both public (testing) and shielded (production) operations.
