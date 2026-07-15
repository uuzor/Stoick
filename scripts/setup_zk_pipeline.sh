#!/bin/bash
# Wraith CLMM ZK Pipeline Setup Script
# This script sets up the complete ZK proof generation infrastructure

set -e

echo "========================================"
echo "Wraith CLMM ZK Pipeline Setup"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="${HOME}/noir"
CIRCUITS_DIR="/workspace/project/Stoick/circuits"
KEYS_DIR="${CIRCUITS_DIR}/keys"

# Create directories
mkdir -p "${INSTALL_DIR}/bin"
mkdir -p "${KEYS_DIR}"

echo -e "${YELLOW}Step 1: Checking current installation...${NC}"

# Check if nargo is installed
if command -v nargo &> /dev/null; then
    NARGO_VERSION=$(nargo --version 2>&1 | grep "nargo version")
    echo -e "  Found: ${GREEN}${NARGO_VERSION}${NC}"
else
    echo -e "  ${RED}nargo not found. Will install.${NC}"
fi

# Check if bb is installed
if command -v bb &> /dev/null; then
    BB_VERSION=$(bb --version 2>&1)
    echo -e "  Found: ${GREEN}${BB_VERSION}${NC}"
else
    echo -e "  ${RED}bb not found. Will install.${NC}"
fi

echo -e "\n${YELLOW}Step 2: Installing Noir tools...${NC}"

# Install using noirup
if ! command -v nargo &> /dev/null || [[ $(nargo --version 2>&1) != *"1.0.0"* ]]; then
    echo "  Installing nargo 1.0.0..."
    # Note: noirup can be flaky, try multiple methods
    curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash 2>/dev/null || true
    export PATH="${HOME}/.nargo/bin:${PATH}"
    
    # Try to install specific version
    if command -v nargo &> /dev/null; then
        echo "  nargo installed successfully"
    else
        echo -e "  ${RED}Failed to install nargo via noirup${NC}"
        echo "  Please install manually:"
        echo "  curl -L https://github.com/noir-lang/noir/releases/download/v1.0.0-beta.11/nargo-x86_64-unknown-linux-gnu.tar.gz | tar -xz -C ~/noir/bin"
    fi
fi

# Install bb
BB_VERSION="5.0.0"
echo "  Installing barretenberg ${BB_VERSION}..."
cd /tmp
curl -L "https://github.com/AztecProtocol/barretenberg/releases/download/v${BB_VERSION}/barretenberg-amd64-linux.tar.gz" -o bb.tar.gz
tar -xzf bb.tar.gz
chmod +x bb
mv bb "${INSTALL_DIR}/bin/bb"
export PATH="${INSTALL_DIR}/bin:${PATH}"
echo -e "  ${GREEN}barretenberg installed${NC}"

echo -e "\n${YELLOW}Step 3: Compiling Noir circuits...${NC}"

# Compile each circuit
cd "${CIRCUITS_DIR}/noir"

for circuit in clmm_mint clmm_burn clmm_swap_exact_in clmm_swap_exact_out clmm_collect; do
    if [ -d "${circuit}" ]; then
        echo "  Compiling ${circuit}..."
        cd "${circuit}"
        nargo compile 2>/dev/null || echo -e "    ${RED}Failed to compile${NC}"
        cd - > /dev/null
    fi
done

echo -e "\n${YELLOW}Step 4: Generating proving and verification keys...${NC}"

# Generate keys for each circuit
for circuit in clmm_mint clmm_burn clmm_swap_exact_in clmm_swap_exact_out clmm_collect; do
    ACIR_FILE="${CIRCUITS_DIR}/noir/${circuit}/target/${circuit}.json"
    VK_FILE="${KEYS_DIR}/${circuit}_vk.json"
    PK_FILE="${KEYS_DIR}/${circuit}_pk.json"
    
    if [ -f "${ACIR_FILE}" ]; then
        echo "  Generating keys for ${circuit}..."
        
        # Generate verification key
        bb write_vk -b "${ACIR_FILE}" -o "${VK_FILE}" 2>/dev/null || echo -e "    ${RED}VK generation failed${NC}"
        
        # Generate proving key  
        bb write_pk -b "${ACIR_FILE}" -o "${PK_FILE}" 2>/dev/null || echo -e "    ${RED}PK generation failed${NC}"
    fi
done

echo -e "\n${YELLOW}Step 5: Summary${NC}"
echo "  Keys directory: ${KEYS_DIR}"
ls -la "${KEYS_DIR}" 2>/dev/null || echo "  No keys generated yet"

echo -e "\n${YELLOW}Step 6: Deployment instructions${NC}"
echo "  To deploy verification keys to the verifier contract:"
echo "  stellar contract invoke \\"
echo "    --id VERIFIER_CONTRACT_ID \\"
echo "    --source-account wraith-clmm \\"
echo "    --network testnet \\"
echo "    -- set_vk_mint \\"
echo "    --admin YOUR_ADMIN_KEY \\"
echo "    --vk \"\$(cat ${KEYS_DIR}/clmm_mint_vk.json | base64)\""

echo -e "\n${GREEN}========================================"
echo "Setup complete!"
echo "========================================${NC}"
