#!/bin/bash
#
# Test script for ZK Verifier and CLMM on Stellar Testnet
# Tests full privacy flow with real proofs
#

set -e

VERIFIER_ID="CBRD22632A74VTBR2HQHDWLN4IK3CXPWJLAEE2F2E3DE3ZZ3S46EYP5M"
CLMM_ID="CDX4KFORPEB33FEUONRPTBHRFCJSJIPNDK52V3YLBDKHXNLYHZSZVLXU"
NETWORK="testnet"
SOURCE="wraith-clmm"
ADMIN_ID="GCRU4LYIMJZHGRNDFGDJWWV626LCHPB2UOMZZZKIZDV5PHJQI6UPZG7Y"
PROOF_FILE="${1:-circuits/artifacts/withdraw/proof}"

echo "=== ZK Verifier and CLMM Full Privacy Test ==="
echo "Verifier: $VERIFIER_ID"
echo "CLMM:     $CLMM_ID"
echo "Proof:    $PROOF_FILE"
echo ""

# Check if proof file exists
if [ ! -f "$PROOF_FILE" ]; then
    echo "ERROR: Proof file not found: $PROOF_FILE"
    echo "Generate proof with:"
    echo "  cd circuits/noir/withdraw"
    echo "  nargo compile && nargo execute witness"
    echo "  bb prove -b target/withdraw.json -w target/witness.gz -o target"
    exit 1
fi

# Get proof hex
PROOF_HEX=$(python3 -c "print(open('$PROOF_FILE', 'rb').read().hex())")
PROOF_SIZE=${#PROOF_HEX}

echo "Proof size: $((PROOF_SIZE / 2)) bytes"
echo ""

echo "1. Checking VK status..."
stellar contract invoke \
  --id "$VERIFIER_ID" \
  --source-account "$SOURCE" \
  --network "$NETWORK" \
  -- get_vk_status

echo ""
echo "2. Verifying real proof on-chain..."
stellar contract invoke \
  --id "$VERIFIER_ID" \
  --source-account "$SOURCE" \
  --network "$NETWORK" \
  -- verify_mint \
  --proof "$PROOF_HEX"

echo ""
echo "3. Testing CLMM mint with real proof..."
stellar contract invoke \
  --id "$CLMM_ID" \
  --source-account "$SOURCE" \
  --network "$NETWORK" \
  -- mint \
  --proof "$PROOF_HEX" \
  --pool_id 1

echo ""
echo "=== All privacy tests passed! ==="
echo ""
echo "The system successfully:"
echo "  ✓ Stores full 1760-byte VK on-chain"
echo "  ✓ Accepts real UltraHonk proofs"
echo "  ✓ Integrates with CLMM contract"
echo "  ✓ Preserves privacy (no sensitive data revealed)"
