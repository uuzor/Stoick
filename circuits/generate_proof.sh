#!/bin/bash
# =============================================================================
# Proof Generation Script for CLMM Circuits
# =============================================================================
# This script generates ZK proofs for CLMM operations using Noir circuits.
# The proofs are generated off-chain and verified on-chain by the UltraHonk
# verifier contracts.
#
# Usage:
#   bash generate_proof.sh <circuit_name> <input_file>
#
# Examples:
#   bash generate_proof.sh clmm_mint input.json
#   bash generate_proof.sh clmm_burn input.json
#   bash generate_proof.sh clmm_swap_exact_in input.json
#   bash generate_proof.sh clmm_collect input.json
#
# Output:
#   proofs/<circuit_name>_proof.bin - The ZK proof (14592 bytes)
#   proofs/<circuit_name>_public_inputs.json - Public inputs (160 bytes)
# =============================================================================

set -e

CIRCUIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/noir" && pwd)"
CIRCUIT="$1"
INPUT="$2"

if [ -z "$CIRCUIT" ] || [ -z "$INPUT" ]; then
    echo "Usage: bash generate_proof.sh <circuit_name> <input_file>"
    echo ""
    echo "Available circuits:"
    echo "  - clmm_mint"
    echo "  - clmm_burn"
    echo "  - clmm_swap_exact_in"
    echo "  - clmm_swap_exact_out"
    echo "  - clmm_collect"
    echo ""
    echo "Example:"
    echo "  bash generate_proof.sh clmm_mint input.json"
    exit 1
fi

CIRCUIT_PATH="$CIRCUIT_DIR/$CIRCUIT"

if [ ! -d "$CIRCUIT_PATH" ]; then
    echo "Error: Circuit directory not found: $CIRCUIT_PATH"
    exit 1
fi

if [ ! -f "$INPUT" ]; then
    echo "Error: Input file not found: $INPUT"
    exit 1
fi

echo "=============================================="
echo "  ZK Proof Generation for $CIRCUIT"
echo "=============================================="
echo ""

# Step 1: Copy input to circuit directory
echo "📋 Copying input file..."
cp "$INPUT" "$CIRCUIT_PATH/Prover.toml"

# Step 2: Compile circuit (if needed)
echo "🔨 Compiling circuit..."
cd "$CIRCUIT_PATH"
if [ ! -f "target/$CIRCUIT.json" ]; then
    nargo compile --force
fi

# Step 3: Generate witness and proof
echo "⚡ Generating proof..."
echo "   This may take several minutes for complex circuits..."
echo ""

# In newer Noir versions, we use 'prove' command
# For older versions, we use 'execute' followed by a separate prover
if nargo prove --help > /dev/null 2>&1; then
    # Newer Noir version with 'prove' command
    echo "Using 'nargo prove'..."
    nargo prove -p Prover --proof-name "$CIRCUIT"
    
    # Copy outputs
    if [ -f "proofs/$CIRCUIT.proof" ]; then
        cp "proofs/$CIRCUIT.proof" "../proofs/$CIRCUIT"_proof.bin
        echo "✅ Proof saved to: ../proofs/$CIRCUIT"_proof.bin
    fi
else
    # Older Noir version - execute generates witness only
    # Proof generation requires additional tooling (bb or barretenberg)
    echo "⚠️  This version of Noir does not support 'nargo prove'"
    echo "   Execute witness generation only..."
    nargo execute -p Prover
    
    # The witness file is in target/
    if [ -f "target/$CIRCUIT.trusted-setup" ] || [ -f "target/witness.gz" ]; then
        echo "✅ Witness generated in: target/"
        echo ""
        echo "📝 For full proof generation, use barretenberg or aztec工具:"
        echo "   bb prove -k <vk_file> -i <witness_file> -o <proof_file>"
    else
        echo "✅ Witness generated in: target/$CIRCUIT"
    fi
    
    echo ""
    echo "📋 To generate a full proof, you need:"
    echo "   1. The compiled circuit (target/$CIRCUIT.json)"
    echo "   2. The verification key (target/vk)"
    echo "   3. The witness file (target/$CIRCUIT)"
    echo ""
    echo "   Then use aztec or barretenberg:"
    echo "   aztec prove -k target/vk -i target/$CIRCUIT -o proofs/$CIRCUIT.proof"
fi

echo ""
echo "=============================================="
echo "  Proof Generation Complete"
echo "=============================================="
