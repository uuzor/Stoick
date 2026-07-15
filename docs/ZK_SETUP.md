# Full ZK Proof Generation Setup Guide

## Overview

This guide explains how to complete the setup for generating real zero-knowledge proofs for the Wraith CLMM system.

## Testnet Deployment

### Primary Contracts

| Contract | Testnet Address | Purpose |
|----------|-----------------|---------|
| **CLMM** | `CDCD4ZQYUKUUXFUFNFRSXNAQ6YVT2IRIROKRXIIKQIDPBRMK4HZ6TPPW` | Main CLMM with ZK verification |
| **Merkle Tree** | `CDB5PDVSHDCODSXRXX73GN4AU5USNR5CPTJ6KOIAP6KAGMPQXGQTBCKZ` | Note commitment storage |
| Admin | `GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y` | Admin account |

### CLMM Operation Verifiers

Each CLMM operation has its own dedicated verifier contract with operation-specific VK:

| Verifier | Address | Circuit | VK Size |
|----------|---------|---------|---------|
| **Mint** | `CDROXB3XDEZZ4D2RYMJABKR2CNBN2OW6K2SRQQUQNN5PCEN4UYJ7U35K` | clmm_mint | 1760 B |
| **Burn** | `CACGOW4ABQEREUYWRYY4FKAD2VY2H6ZT53ZQJ4JXFGFTH3QGT2ZTWDPJ` | clmm_burn | 1760 B |
| **Collect** | `CB2GGVSSINHSMQLHGNCVH2CFLLNBHZBDLGMT3PBIM2424CJ4GAUWAT6H` | clmm_collect | 1760 B |
| **Swap** | `CDDFCTXVKCG4FSZX3ZMNDQFCD6AHAPSR2PR4Z36HEIJA2FRRGE6Y5SUJ` | clmm_swap_exact_in | 1760 B |

### Legacy Verifier (for testing)

| Contract | Testnet Address | Purpose |
|----------|-----------------|---------|
| **Withdraw** | `CBTDPDHITGHVHPRWVYYCNANUY2WOJT2KCAA4NFDHWWYVHTIJVFPOQAZE` | Testing with withdraw circuit |

## Architecture

The system uses **rs-soroban-ultrahonk** from Nethermind for actual cryptographic verification:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Noir Circuits                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ withdraw │ │clmm_mint │ │clmm_burn │ │clmm_swap │ │clmm_coll │        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘        │
│       │            │            │            │            │                │
│       └────────────┴────────────┴────────────┴────────────┘                │
│                                    │                                         │
│                              bb prove                                       │
│                                    │                                         │
│                         ┌──────────┴──────────┐                             │
│                         │   Proof (14592 B)  │                             │
│                         │ Public Inputs (160B)│                             │
│                         └──────────┬──────────┘                             │
└────────────────────────────────────│────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Stellar Soroban                                     │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                           CLMM Contract                                │   │
│  │                                                                      │   │
│  │   mint ────┬──▶ Mint Verifier (clmm_mint VK)                        │   │
│  │   burn ────┼──▶ Burn Verifier (clmm_burn VK)                        │   │
│  │   swap ────┼──▶ Swap Verifier (clmm_swap_exact_in VK)              │   │
│  │   collect ─┴──▶ Collect Verifier (clmm_collect VK)                 │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    UltraHonk Verifier (per operation)                │   │
│  │   • rs-soroban-ultrahonk from Nethermind                           │   │
│  │   • VK validated in constructor (immutable)                         │   │
│  │   • verify_proof(public_inputs, proof_bytes) → ()                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Current Status

| Component | Status | Details |
|-----------|--------|---------|
| CLMM Contract | ✅ Deployed | Cross-contract verifier calls |
| CLMM-specific Verifiers | ✅ Deployed | Mint, Burn, Collect, Swap |
| Merkle Tree | ✅ Deployed | Note commitment storage |
| Noir Circuits | ✅ Compiled | 5 CLMM circuits + withdraw |
| CLMM Verification Keys | ✅ Generated | 1760 bytes each for all 5 circuits |
| VK in Constructor | ✅ Working | VK validated at deploy time |
| Real Proof Test | ✅ **PASSED** | 14592-byte proof + 160-byte inputs |
| CLMM-Verifier Flow | ✅ **PASSED** | Full integration works |
| Merkle Tree Insert | ✅ **PASSED** | Leaf insertion and root computation working |
| Multi-verifier Setup | ✅ **PASSED** | Separate VK per operation type |
| Cross-Contract Calls | ✅ **PASSED** | CLMM → Verifier invocation working |
| Integration Test | ✅ **PASSED** | scripts/test_clmm_flow.sh runs successfully |

## Integration Test

Run the full integration test:
```bash
bash scripts/test_clmm_flow.sh
```

This tests the complete shielded flow:
1. Create Pool
2. Add Liquidity (mint with ZK proof → Merkle tree)
3. Swap (swap with ZK proof → Merkle tree)
4. Remove Liquidity (burn with ZK proof)
5. Collect Fees (collect with ZK proof → Merkle tree)

## UltraHonk Verification Flow

### 1. Generate Proof (Off-chain)

```bash
cd circuits/noir/<circuit_name>
nargo compile --force
nargo execute witness

bb prove --scheme ultra_honk --oracle_hash keccak \
  -b target/<circuit_name>.json -w target/witness.gz -o target
```

### 2. Deploy Verifier with VK

```bash
# VK is set at deployment time (immutable)
stellar contract deploy \
  --wasm verifier.wasm \
  --source-account wraith-clmm \
  --network testnet \
  -- --vk_bytes $(python3 -c "print(open('vk', 'rb').read().hex())")
```

### 3. Verify Proof On-chain

```bash
stellar contract invoke \
  --id $VERIFIER_ID \
  --source-account wraith-clmm \
  --network testnet \
  -- verify_proof \
  --public_inputs "$PUBLIC_INPUTS_HEX" \
  --proof_bytes "$PROOF_HEX"
```

### 4. Test Results

| Test | Result | Details |
|------|--------|---------|
| Verifier deployment | ✅ | VK validated (1760 bytes) |
| verify_proof | ✅ | `null` (success) |
| CLMM.mint | ✅ | Transaction submitted |

## Privacy Model Verification

The system successfully implements:

1. **Note Commitment**: User's balance is committed via Poseidon hash
2. **Nullifier**: Prevents double-spend without revealing the note
3. **Merkle Proof**: Verifies note exists in the privacy tree
4. **ZK Proof**: Proves knowledge of valid note without revealing it

### Verified Privacy Properties

```
Proof Input:  Merkle Root, Nullifier, Amount, Asset
Proof Output: Verification (null = success) - NO sensitive data revealed
```

## Full Privacy Test Flow

### 1. Generate Proof (Off-chain)

```bash
# Compile circuit
cd circuits/noir/withdraw
nargo compile --force

# Generate witness
nargo execute witness

# Generate proof with public inputs
bb prove --scheme ultra_honk --oracle_hash keccak \
  -b target/withdraw.json -w target/witness.gz -o target \
  --output_format bytes_and_fields
```

### 2. Deploy Verifier with VK

```bash
# Deploy verifier with VK in constructor (immutable)
stellar contract deploy \
  --wasm verifier.wasm \
  --source-account wraith-clmm \
  --network testnet \
  -- --vk_bytes $(python3 -c "print(open('vk', 'rb').read().hex())")
```

### 3. Test Verification

```bash
# Get proof and public inputs hex
PROOF_HEX=$(python3 -c "print(open('proof', 'rb').read().hex())")
PUBLIC_INPUTS=$(python3 -c "print(open('public_inputs', 'rb').read().hex())")

# Verify proof on-chain using UltraHonk
stellar contract invoke \
  --id $VERIFIER_ID \
  --source-account wraith-clmm \
  --network testnet \
  -- verify_proof \
  --public_inputs "$PUBLIC_INPUTS" \
  --proof_bytes "$PROOF_HEX"

# Test CLMM integration
stellar contract invoke \
  --id $CLMM_ID \
  --source-account wraith-clmm \
  --network testnet \
  -- mint \
  --proof "$PROOF_HEX" \
  --public_inputs "$PUBLIC_INPUTS" \
  --pool_id 1
```

### Test Results

| Test | Result | Transaction |
|------|--------|-------------|
| Verifier Deploy | ✅ | VK validated (1760 bytes) |
| verify_proof | ✅ `null` | Simulation |
| CLMM.mint | ✅ `null` | [a91e8042421a](https://stellar.expert/explorer/testnet/tx/a91e8042421af455bcadbc93949fe87021a469f5b070c1ede1d0e1654bbee8bc) |

## ⚠️ CRITICAL: Version Requirements

**The Wraith project uses PINNED toolchain versions**:

- Noir: `1.0.0-beta.9`
- Barretenberg (bb): `0.87.0`
- Rust: Latest stable

| Tool | Version | Install Command |
|------|---------|----------------|
| `nargo` | **1.0.0-beta.9** | `noirup -v 1.0.0-beta.9` |
| `bb` | **0.87.0** | `bbup -v 0.87.0` |
| `poseidon` lib | **v0.2.0** | In Nargo.toml |
| `stellar` | **27.0.0** | See TOOLCHAIN.md |

**Why pinned versions?**
- Proof = 14,592 bytes, VK = 1,760 bytes (UltraHonk, keccak)
- Latest Noir/bb produce: Proof = 4,544 bytes, VK = 1,888 bytes
- **These are incompatible with the on-chain verifier!**

## Step 1: Install Compatible Tools

### 1.1 Install nargo 1.0.0-beta.9

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
source ~/.bashrc
noirup -v 1.0.0-beta.9

# Verify
nargo --version
# Should output: nargo version = 1.0.0-beta.9
```

### 1.2 Install bbup and bb 0.87.0

```bash
# Clone and build bbup (the standard installer)
cd /tmp
git clone https://github.com/AztecProtocol/aztec-packages.git
cd aztec-packages/barretenberg/bbup
cargo build --release
cargo install --path .

# Install bb 0.87.0
bbup -v 0.87.0

# Verify
bb --version
# Should output: 0.87.0
```

### 1.2 Direct Download bb 0.87.0 (Recommended)

```bash
# Download from aztec-packages v0.87.0 release
cd /tmp
curl -L "https://github.com/AztecProtocol/aztec-packages/releases/download/v0.87.0/barretenberg-amd64-linux.tar.gz" -o bb.tar.gz
tar -xzf bb.tar.gz
chmod +x bb
mkdir -p ~/.bb
mv bb ~/.bb/bb
export PATH="$HOME/.bb:$PATH"

# Verify
bb --version
# Should output: 0.87.0
```

> **Note**: The `bb` binary is inside the tar.gz with that exact name (no "barretenberg" prefix).

## Step 2: Set Up Environment

```bash
# Source the project's env.sh
cd /workspace/project/Stoick
source env.sh

# Verify tools
nargo --version  # Should be 1.0.0-beta.9
bb --version     # Should be 0.87.0
```

## Step 3: Generate Keys (bb 0.87.0 Command Syntax)

With bb 0.87.0, use these commands:

```bash
export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.cargo/bin:$PATH"
mkdir -p /workspace/project/Stoick/circuits/keys
mkdir -p /workspace/project/Stoick/circuits/artifacts/clmm_mint

# For each circuit:
cd /workspace/project/Stoick/circuits/noir/clmm_mint

# Compile the circuit (if not already done)
nargo compile

# Generate Verification Key (UltraHonk + Keccak)
bb write_vk \
  --scheme ultra_honk \
  --oracle_hash keccak \
  -b ./target/clmm_mint.json \
  -o /workspace/project/Stoick/circuits/keys \
  --output_format bytes_and_fields
# Output: vk (1760 bytes), vk_fields.json

# Copy to artifacts for deployment
cp /workspace/project/Stoick/circuits/keys/vk /workspace/project/Stoick/circuits/artifacts/clmm_mint/vk

# Verify the VK size
wc -c /workspace/project/Stoick/circuits/keys/vk
# Should output: 1760
```

> **Note**: The `write_pk` command doesn't exist in bb 0.87.0. The proving key is generated
> during proof creation with the `prove` command.

## Step 4: Deploy Prover Service

Create a prover service that generates proofs for clients:

### Dockerfile
```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    curl \
    build-essential

# Install Noir tools
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
ENV PATH="$HOME/.nargo/bin:${PATH}"

# Copy circuit artifacts
COPY ./circuits/ /app/circuits/
COPY ./keys/ /app/keys/

# Expose API
EXPOSE 8080

CMD ["python3", "-m", "http.server", "8080"]
```

### Prover API Server (Python)

```python
#!/usr/bin/env python3
"""
Wraith CLMM Prover Service

Generates ZK proofs for CLMM operations using Noir circuits.
"""

import subprocess
import json
import os
import tempfile
from flask import Flask, request, jsonify

app = Flask(__name__)

CIRCUITS_DIR = os.environ.get('CIRCUITS_DIR', '/app/circuits')
KEYS_DIR = os.environ.get('KEYS_DIR', '/app/keys')

@app.route('/prove/mint', methods=['POST'])
def prove_mint():
    """Generate a mint proof."""
    data = request.json
    
    # Write input witness to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(data['inputs'], f)
        witness_file = f.name
    
    try:
        # Generate witness
        subprocess.run([
            'nargo', 'execute',
            '--no-proof-gen',
            '-w', witness_file
        ], cwd=f"{CIRCUITS_DIR}/clmm_mint", check=True)
        
        # Generate proof
        result = subprocess.run([
            'bb', 'prove',
            '-b', f"{CIRCUITS_DIR}/clmm_mint/target/clmm_mint.json",
            '-w', f"{CIRCUITS_DIR}/clmm_mint/target/witness.gz",
            '-p', f"{KEYS_DIR}/clmm_mint_pk.json",
            '-o', f"/tmp/proof.json"
        ], capture_output=True, text=True, check=True)
        
        with open('/tmp/proof.json', 'r') as f:
            proof = f.read()
        
        return jsonify({
            'success': True,
            'proof': proof
        })
    finally:
        os.unlink(witness_file)

@app.route('/prove/burn', methods=['POST'])
def prove_burn():
    """Generate a burn proof."""
    # Similar to mint
    pass

@app.route('/prove/swap', methods=['POST'])
def prove_swap():
    """Generate a swap proof."""
    # Similar to mint
    pass

@app.route('/prove/collect', methods=['POST'])
def prove_collect():
    """Generate a collect proof."""
    # Similar to mint
    pass

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

## Step 5: Update Verifier Contract

The current verifier contract uses placeholder logic. To use real Groth16 verification:

### Option A: Use UltraPlonk (Recommended)

```rust
// In contracts/verifier/src/lib.rs

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror,
    Address, BytesN, Env,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    VkMint,
    VkBurn,
    VkSwap,
    VkCollect,
    Admin,
}

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VerifierError {
    InvalidProof = 1,
    VerificationFailed = 2,
    VkNotSet = 3,
    InvalidPublicInputs = 4,
}

#[contract]
pub struct ZkVerifier;

#[contractimpl]
impl ZkVerifier {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn set_vk_mint(env: Env, admin: Address, vk: BytesN<64>) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::VkMint, &vk);
    }

    pub fn verify_mint(env: Env, proof: BytesN<72>, public_inputs: [u128; 10]) -> Result<bool, VerifierError> {
        let vk: Option<BytesN<64>> = env.storage().instance().get(&DataKey::VkMint);
        let vk = vk.ok_or(VerifierError::VkNotSet)?;
        
        // Real Groth16 verification would go here
        // For now, we check proof format
        
        // Convert proof bytes
        let proof_bytes = proof.to_bytes();
        
        // Check for non-zero proof
        let mut has_nonzero = false;
        let mut i = 0u32;
        while i < 72 {
            if proof_bytes.get(i).unwrap_or(0) != 0 {
                has_nonzero = true;
                break;
            }
            i += 1;
        }
        
        if !has_nonzero {
            return Err(VerifierError::InvalidProof);
        }
        
        // TODO: Implement actual pairing-based verification
        // This requires implementing or importing:
        // - BLS12-381 curve operations
        // - Elliptic curve pairing checks
        // - Groth16 verification equation
        
        Ok(true)
    }
}
```

### Option B: Use Solidity Verifier (via write_solidity_verifier)

```bash
# Generate Solidity verifier
bb write_solidity_verifier \
  -b ./target/clmm_mint.json \
  -o ./verifier.sol
```

## Step 6: Integration with Client SDK

### JavaScript/TypeScript Client

```typescript
import { proveMint, proveBurn, proveSwap, proveCollect } from '@wraith/clmm-sdk';

async function shieldedMint(poolId: number, amount: bigint) {
  // 1. Generate witness locally
  const inputs = {
    pool_id: poolId,
    amount: amount,
    // ... other private inputs
  };
  
  // 2. Call prover service
  const response = await fetch('https://prover.wraith.io/prove/mint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs })
  });
  
  const { proof } = await response.json();
  
  // 3. Submit to chain
  await clmmContract.mint({
    proof: proof,
    pool_id: poolId
  });
}
```

## Testing the Full Pipeline

### 1. Generate a Test Proof

```bash
cd /workspace/project/Stoick/circuits/noir/clmm_mint

# Create test inputs
cat > test_input.json << 'EOF'
{
  "pool_id": 1,
  "amount": "1000000",
  "tick_lower": -1000,
  "tick_upper": 1000,
  "salt": "0x1234..."
}
EOF

# Execute to generate witness
nargo execute test_input.json

# Generate proof
bb prove \
  -b ./target/clmm_mint.json \
  -w ./target/witness.gz \
  -p ../keys/clmm_mint_pk.json \
  -o ./proof.json

# Verify proof
bb verify \
  -k ../keys/clmm_mint_vk.json \
  -p ./proof.json
```

### 2. Deploy Keys to Verifier Contract

The VK must be converted to hex format (1760 bytes = 3520 hex chars):

```bash
# Convert VK to hex
VK_HEX=$(xxd -p /workspace/project/Stoick/circuits/keys/clmm_mint_vk | tr -d '\n')

# Deploy to verifier contract
stellar contract invoke \
  --id CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS \
  --source-account wraith-clmm \
  --network testnet \
  -- set_vk_mint \
  --admin GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y \
  --vk "$VK_HEX"

# Verify VK status
stellar contract invoke \
  --id CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS \
  --source-account wraith-clmm \
  --network testnet \
  --send=no \
  -- get_vk_status
# Should return: [true,false,false,false]
```

### 3. Submit a Real Proof

```bash
# Convert proof to base64 for submission
PROOF_B64=$(base64 -w0 /workspace/project/Stoick/circuits/keys/clmm_mint_proof)

# Submit proof
stellar contract invoke \
  --id CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ \
  --source-account user \
  --network testnet \
  -- mint \
  --proof "$PROOF_B64" \
  --pool_id 1
```

## Production Checklist

- [ ] Generate all proving keys (mint, burn, swap_exact_in, swap_exact_out, collect)
- [ ] Generate all verification keys
- [ ] Deploy prover service with high availability
- [ ] Update verifier contract with real Groth16 verification
- [ ] Set all verification keys on-chain
- [ ] Implement Merkle tree contract for note commitments
- [ ] Implement nullifier list for double-spend prevention
- [ ] Security audit of ZK circuit constraints
- [ ] Penetration testing of prover service API
- [ ] Key ceremony for trusted setup (optional)

## References

- [Noir Language Documentation](https://noir-lang.org/)
- [Aztec Networks Barretenberg](https://github.com/AztecProtocol/barretenberg)
- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf)
- [Uniswap V4 Hooks](https://github.com/Uniswap/v4-core)
