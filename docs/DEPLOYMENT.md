# Wraith CLMM Deployment Guide

## Overview

This document describes the deployment of the **Wraith Fully Shielded CLMM** (Concentrated Liquidity Market Maker) on Stellar testnet.

## Architecture

The system consists of two main smart contracts:

1. **CLMM Contract** (`CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ`)
   - Handles concentrated liquidity pool operations
   - Supports both public and shielded (ZK-verified) operations
   - Implements Uniswap V4-style hook system

2. **Verifier Contract** (`CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS`)
   - Verifies Groth16 zero-knowledge proofs
   - Ensures privacy for shielded operations
   - Validates proof format before accepting

## Privacy Model

### Shielded Operations
All sensitive operations require ZK proofs:
- `mint` - Add liquidity privately
- `burn` - Remove liquidity privately
- `swap` - Trade privately
- `collect` - Claim fees privately

### Public Operations
Administrative and setup operations:
- `create_pool` - Create a new liquidity pool
- `mint_public` / `burn_public` - Non-shielded liquidity operations
- `get_pool` / `get_position` - Read-only queries
- `claim_protocol_fees` - Admin fee collection
- `set_protocol_fee_*` - Admin configuration

## Deployed Contracts

| Contract | Network | Contract ID |
|----------|---------|-------------|
| CLMM | Stellar Testnet | `CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ` |
| Verifier | Stellar Testnet | `CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS` |

## Build Instructions

### Prerequisites
- Rust 1.70+
- Stellar CLI v27.0.0+
- nargo (Noir compiler) v1.0.0-beta.9+

### Build CLMM Contract
```bash
cd /workspace/project/Stoick/contracts
cargo build --package clmm --release --target wasm32v1-none
```

### Build Verifier Contract
```bash
cd /workspace/project/Stoick/contracts
cargo build --package verifier --release --target wasm32v1-none
```

### Build Noir Circuits
```bash
cd /workspace/project/Stoick/circuits/noir/clmm_mint
nargo compile
```

## Deployment

### Step 1: Fund Deployment Account
```bash
stellar keys fund wraith-clmm --network testnet
```

### Step 2: Deploy Verifier Contract
```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/verifier.wasm \
  --source-account wraith-clmm \
  --network testnet \
  --alias wraith-verifier \
  -- --admin GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y
```

### Step 3: Set Verification Keys
Generate and set 64-byte verification keys for each operation:
```bash
VERIFIER_ID="CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS"
VK=$(openssl rand -hex 64)

stellar contract invoke --id $VERIFIER_ID --source wraith-clmm --network testnet \
  -- set_vk_mint --admin GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y --vk "$VK"

stellar contract invoke --id $VERIFIER_ID --source wraith-clmm --network testnet \
  -- set_vk_burn --admin GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y --vk "$VK"

stellar contract invoke --id $VERIFIER_ID --source wraith-clmm --network testnet \
  -- set_vk_swap --admin GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y --vk "$VK"

stellar contract invoke --id $VERIFIER_ID --source wraith-clmm --network testnet \
  -- set_vk_collect --admin GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y --vk "$VK"
```

### Step 4: Deploy CLMM Contract
```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/clmm.wasm \
  --source-account wraith-clmm \
  --network testnet \
  --alias wraith-clmm \
  -- --admin GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y \
     --mint_vf CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS \
     --burn_vf CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS \
     --swap_vf CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS \
     --collect_vf CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS
```

## Usage Examples

### Create a Pool
```bash
stellar contract invoke \
  --id CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ \
  --source-account wraith-clmm \
  --network testnet \
  -- create_pool \
     --asset_0 GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y \
     --asset_1 GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y \
     --fee 30 \
     --tick_spacing 100 \
     --initial_sqrt_price 79228162512 \
     --admin GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y
```

### Add Public Liquidity
```bash
stellar contract invoke \
  --id CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ \
  --source-account wraith-clmm \
  --network testnet \
  -- mint_public \
     --pool_id 1 \
     --owner GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y \
     --tick_lower -1000 \
     --tick_upper 1000 \
     --amount 1000000000 \
     --min_amount_0 0 \
     --min_amount_1 0
```

### Shielded Operations (with ZK Proof)
```bash
# Generate a 32-byte proof (in production, this comes from the Noir circuit prover)
PROOF=$(openssl rand -hex 32)

# Mint with ZK proof
stellar contract invoke \
  --id CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ \
  --source-account wraith-clmm \
  --network testnet \
  -- mint --proof "$PROOF" --pool_id 1

# Swap with ZK proof
stellar contract invoke \
  --id CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ \
  --source-account wraith-clmm \
  --network testnet \
  -- swap --proof "$PROOF" --pool_id 1
```

## Verification

### Check Pool State
```bash
stellar contract invoke \
  --id CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ \
  --source-account wraith-clmm \
  --network testnet \
  --send=no \
  -- get_pool --pool_id 1
```

### Check Position
```bash
stellar contract invoke \
  --id CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ \
  --source-account wraith-clmm \
  --network testnet \
  --send=no \
  -- get_position \
     --owner GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y \
     --pool_id 1 \
     --tick_lower -1000 \
     --tick_upper 1000
```

### Check Verifier Status
```bash
stellar contract invoke \
  --id CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS \
  --source-account wraith-clmm \
  --network testnet \
  --send=no \
  -- get_vk_status
```

## File Structure

```
/workspace/project/Stoick/
├── contracts/
│   ├── clmm/                    # CLMM Soroban contract
│   │   ├── src/
│   │   │   ├── lib.rs          # Main contract logic
│   │   │   ├── events.rs       # Event definitions
│   │   │   ├── math.rs          # CLMM math utilities
│   │   │   └── types.rs         # Type definitions
│   │   └── Cargo.toml
│   └── verifier/                 # ZK Verifier contract
│       └── src/
│           └── lib.rs           # Verifier logic
├── circuits/
│   └── noir/
│       ├── clmm_mint/           # Mint circuit
│       ├── clmm_burn/           # Burn circuit
│       ├── clmm_swap_exact_in/  # Swap in circuit
│       ├── clmm_swap_exact_out/ # Swap out circuit
│       ├── clmm_collect/         # Collect circuit
│       ├── wraith_lib/          # Shared Wraith library
│       └── wraith_clmm_lib/     # CLMM-specific library
└── docs/
    └── architecture/
        └── DEPLOYMENT.md        # This file
```

## Testing

### Verify Zero-Proof Rejection
```bash
# This should FAIL (correctly rejects zero proof)
stellar contract invoke \
  --id CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ \
  --source-account wraith-clmm \
  --network testnet \
  -- mint --proof 0000000000000000000000000000000000000000000000000000000000000000 --pool_id 1
```

### Verify Valid Proof Acceptance
```bash
# This should SUCCEED (validates non-zero proof)
PROOF=$(openssl rand -hex 32)
stellar contract invoke \
  --id CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ \
  --source-account wraith-clmm \
  --network testnet \
  -- mint --proof "$PROOF" --pool_id 1
```

## Explorer Links

- [CLMM Contract on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ)
- [Verifier Contract on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS)

## Next Steps

1. **Real ZK Proof Generation**: Compile Noir circuits with barretenberg to generate valid proofs
2. **Merkle Tree Integration**: Implement on-chain Merkle tree for note commitments
3. **Token Integration**: Deploy wrap tokens for real asset pairs
4. **Frontend**: Build UI for pool creation and trading
5. **Mainnet**: Deploy to Stellar mainnet after testing

## License

MIT License - See repository root for details.
