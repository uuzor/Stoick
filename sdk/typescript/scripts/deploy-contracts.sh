#!/bin/bash
# =============================================================================
# Deploy CLMM Contracts to Testnet
# =============================================================================
# This script deploys all CLMM contracts and configures the CLMM with verifiers.
#
# Requirements:
#   - stellar CLI installed
#   - Funded testnet account
#
# Usage:
#   chmod +x deploy-contracts.sh
#   ./deploy-contracts.sh
# =============================================================================

set -e

NETWORK="testnet"
ADMIN_KEY="GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y"

echo "========================================"
echo "Deploying Wraith CLMM Contracts"
echo "========================================"

# Step 1: Build WASMs
echo ""
echo "==> Building contracts..."
cd /workspace/project/Stoick/contracts
cargo build --target wasm32v1-none --release

# Step 2: Deploy Merkle Tree
echo ""
echo "==> Deploying Merkle Tree..."
MERKLE_TREE=$(stellar contract deploy \
    --wasm target/wasm32v1-none/release/merkle_tree.wasm \
    --source wraith-clmm \
    --network $NETWORK \
    -- --admin $ADMIN_KEY | tail -1)
echo "    MERKLE_TREE=$MERKLE_TREE"

# Step 3: Deploy Verifiers
echo ""
echo "==> Deploying Verifiers..."

echo "    Deploying Mint Verifier..."
MINT_VF=$(stellar contract deploy \
    --wasm ../vendor/rs-soroban-ultrahonk/target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm \
    --source wraith-clmm \
    --network $NETWORK \
    -- --vk_bytes_file_path ../circuits/artifacts/clmm_mint/vk | tail -1)

echo "    Deploying Burn Verifier..."
BURN_VF=$(stellar contract deploy \
    --wasm ../vendor/rs-soroban-ultrahonk/target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm \
    --source wraith-clmm \
    --network $NETWORK \
    -- --vk_bytes_file_path ../circuits/artifacts/clmm_burn/vk | tail -1)

echo "    Deploying Swap Verifier..."
SWAP_VF=$(stellar contract deploy \
    --wasm ../vendor/rs-soroban-ultrahonk/target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm \
    --source wraith-clmm \
    --network $NETWORK \
    -- --vk_bytes_file_path ../circuits/artifacts/clmm_swap_exact_in/vk | tail -1)

echo "    Deploying Collect Verifier..."
COLLECT_VF=$(stellar contract deploy \
    --wasm ../vendor/rs-soroban-ultrahonk/target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm \
    --source wraith-clmm \
    --network $NETWORK \
    -- --vk_bytes_file_path ../circuits/artifacts/clmm_collect/vk | tail -1)

echo "    Verifiers:"
echo "      MINT_VF=$MINT_VF"
echo "      BURN_VF=$BURN_VF"
echo "      SWAP_VF=$SWAP_VF"
echo "      COLLECT_VF=$COLLECT_VF"

# Step 4: Deploy CLMM
echo ""
echo "==> Deploying CLMM..."
CLMM=$(stellar contract deploy \
    --wasm target/wasm32v1-none/release/clmm.wasm \
    --source wraith-clmm \
    --network $NETWORK \
    -- \
    --admin $ADMIN_KEY \
    --mint_vf $MINT_VF \
    --burn_vf $BURN_VF \
    --swap_vf $SWAP_VF \
    --collect_vf $COLLECT_VF \
    --merkle_tree $MERKLE_TREE | tail -1)

echo "    CLMM=$CLMM"

# Step 5: Configure authorized inserter
echo ""
echo "==> Configuring Merkle Tree authorized inserter..."
stellar contract invoke \
    --id $MERKLE_TREE \
    --source wraith-clmm \
    --network $NETWORK \
    -- set_authorized_inserter \
    --inserter $CLMM

echo ""
echo "========================================"
echo "Deployment Complete!"
echo "========================================"
echo ""
echo "Contract Addresses:"
echo "  CLMM:       $CLMM"
echo "  MerkleTree: $MERKLE_TREE"
echo "  Mint VF:    $MINT_VF"
echo "  Burn VF:    $BURN_VF"
echo "  Swap VF:    $SWAP_VF"
echo "  Collect VF: $COLLECT_VF"
echo ""
echo "Explorer Links:"
echo "  CLMM:       https://stellar.expert/explorer/testnet/contract/$CLMM"
echo "  MerkleTree: https://stellar.expert/explorer/testnet/contract/$MERKLE_TREE"
echo ""
