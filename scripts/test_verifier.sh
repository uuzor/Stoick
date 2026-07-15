#!/bin/bash
#
# Test script for ZK Verifier and CLMM on Stellar Testnet
#

set -e

VERIFIER_ID="CAGUARZJRV3X6TR7NHE6CVNOBMDVOFMFZODWKX7DKPPDACLYHK5RQ7PY"
CLMM_ID="CBSS3V57WWIFFHRQHA5Q5FD3A73MLHDXZIVBR7RJNDPCE6WBVHVOKE75"
NETWORK="testnet"
SOURCE="wraith-clmm"

echo "=== ZK Verifier and CLMM Test Script ==="
echo ""

echo "1. Checking VK status..."
stellar contract invoke \
  --id "$VERIFIER_ID" \
  --source-account "$SOURCE" \
  --network "$NETWORK" \
  -- get_vk_status

echo ""
echo "2. Testing verify_mint with dummy proof..."
stellar contract invoke \
  --id "$VERIFIER_ID" \
  --source-account "$SOURCE" \
  --network "$NETWORK" \
  -- verify_mint \
  --proof "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

echo ""
echo "3. Testing CLMM mint (verifier integration)..."
stellar contract invoke \
  --id "$CLMM_ID" \
  --source-account "$SOURCE" \
  --network "$NETWORK" \
  -- mint \
  --proof "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" \
  --pool_id 1

echo ""
echo "=== All tests passed! ==="
