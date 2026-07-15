# Full ZK Proof Generation Setup Guide

## Overview

This guide explains how to complete the setup for generating real zero-knowledge proofs for the Wraith CLMM system.

## Current Status

| Component | Status |
|-----------|--------|
| CLMM Contract | ✅ Deployed |
| Verifier Contract | ✅ Deployed |
| Noir Circuits | ✅ Compiled to ACIR |
| Proving Keys | ❌ Need generation |
| Verification Keys | ❌ Need generation |
| Proof Generation | ❌ Need prover service |

## Version Compatibility Matrix

| Noir Version | Barretenberg | Status |
|--------------|--------------|--------|
| 1.0.0-beta.9 | 0.36.x | ⚠️ Compatible |
| 1.0.0-beta.11 | 0.38.x | ✅ Recommended |
| 1.0.0 (stable) | 0.45.x | ✅ Latest |

## Step 1: Install Compatible Tools

### Option A: Using Noirup (Recommended)

```bash
# Install latest stable Noir with matching barretenberg
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
source ~/.bashrc
noirup --version latest
```

### Option B: Manual Installation

```bash
# Download compatible versions
mkdir -p ~/noir/bin

# Download nargo 1.0.0-beta.11
curl -L https://github.com/noir-lang/noir/releases/download/v1.0.0-beta.11/nargo-x86_64-unknown-linux-gnu.tar.gz | tar -xz -C ~/noir/bin

# Download matching barretenberg
curl -L https://github.com/AztecProtocol/barretenberg/releases/download/v0.38.0/bb-x86_64-linux-gnu.tar.gz | tar -xz -C ~/noir/bin

chmod +x ~/noir/bin/*
export PATH="$HOME/noir/bin:$PATH"
```

## Step 2: Regenerate Circuits

```bash
cd /workspace/project/Stoick/circuits/noir

# Update Nargo.toml to use compatible version
# Change: noir = "1.0.0-beta.9"
# To:     noir = "1.0.0-beta.11"

# Recompile all circuits
cd clmm_mint && nargo compile
cd ../clmm_burn && nargo compile
cd ../clmm_swap_exact_in && nargo compile
cd ../clmm_swap_exact_out && nargo compile
cd ../clmm_collect && nargo compile
```

## Step 3: Generate Proving and Verification Keys

```bash
export PATH="$HOME/noir/bin:$PATH"
mkdir -p /workspace/project/Stoick/circuits/keys

# For each circuit:
cd /workspace/project/Stoick/circuits/noir/clmm_mint

# Generate Verification Key
bb write_vk \
  -b ./target/clmm_mint.json \
  -o ./target/clmm_mint_vk.json

# Generate Proving Key
bb write_pk \
  -b ./target/clmm_mint.json \
  -o ./target/clmm_mint_pk.json

# Copy keys to keys directory
cp ./target/clmm_mint_vk.json /workspace/project/Stoick/circuits/keys/
cp ./target/clmm_mint_pk.json /workspace/project/Stoick/circuits/keys/
```

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

### 2. Deploy and Test

```bash
# Deploy updated verifier with real VK
stellar contract invoke \
  --id CDIFJYTYVMJUOD2QOI6P5UIJHRL32AYM75MVCW5T7I6JHPADEXZ3A3WS \
  --source-account wraith-clmm \
  --network testnet \
  -- set_vk_mint \
  --admin GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y \
  --vk "$(cat ../keys/clmm_mint_vk.json | base64)"

# Submit proof
stellar contract invoke \
  --id CCZPXV33XGFWIUATMDLOQ5PL5JAJRYN6GIFBJT5Q2XHLNETPG5TX37NQ \
  --source-account user \
  --network testnet \
  -- mint \
  --proof "$(cat ./proof.json | base64)" \
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
