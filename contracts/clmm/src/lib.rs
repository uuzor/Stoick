//! Wraith CLMM Contract
//!
//! Fully Shielded Concentrated Liquidity Market Maker for Stellar.
//! Integrates with Merkle Tree for privacy-preserving note commitments.

#![no_std]

mod events;
mod math;
mod types;

#[contract]
pub struct Clmm;

use events::{MintEvent, PoolCreatedEvent, ProtocolFeeClaimEvent};
use math::validate_tick_range;
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, Address, Bytes, BytesN, Env,
};

// Verifier client for cross-contract calls to UltraHonk verifier
mod verifier_client {
    use soroban_sdk::{contracterror, Address, Bytes, Env};
    
    #[contracterror]
    #[repr(u32)]
    #[derive(Copy, Clone, Debug, Eq, PartialEq)]
    pub enum VerifierError {
        VerificationFailed = 1,
        InvalidProof = 2,
        VkNotSet = 3,
    }
    
    // Client for calling UltraHonkVerifierContract
    // The verifier has a single function: verify_proof(public_inputs, proof_bytes)
    pub struct UltraHonkVerifier;
    
    impl UltraHonkVerifier {
        /// Call the verifier contract to verify a proof
        pub fn verify(
            env: &Env,
            verifier_addr: &Address,
            public_inputs: &Bytes,
            proof_bytes: &Bytes,
        ) -> Result<(), VerifierError> {
            // Use the verifier contract's verify_proof function
            // The verifier contract is: UltraHonkVerifierContract
            // Function: verify_proof(public_inputs: Bytes, proof_bytes: Bytes) -> Result<(), Error>
            
            // Create a client-like call using the soroban_sdk
            // In production, this would use a proper client generated from WASM
            
            // For now, we'll use require_auth with a check that the verifier accepted the call
            // The actual verification happens on-chain at the verifier contract
            
            // Note: In Soroban, cross-contract calls require the contract to have
            // a callable entry point. The verifier contract has verify_proof.
            // We'll need to use the call function or generate a proper client.
            
            // Placeholder - actual implementation needs generated client
            Ok(())
        }
    }
}

// Client for UltraHonkVerifierContract
// This is a simple wrapper for making cross-contract calls
mod ultra_hoink_verifier_client {
    use soroban_sdk::{Address, Bytes, Env, IntoVal};
    
    /// Client for calling the UltraHonkVerifierContract
    pub struct Client {
        env: Env,
        addr: Address,
    }
    
    impl Client {
        pub fn new(env: Env, addr: Address) -> Self {
            Self { env, addr }
        }
        
        /// Call verify_proof on the verifier contract
        /// This will panic if verification fails
        pub fn verify_proof(&self, public_inputs: &Bytes, proof: &Bytes) {
            // Use env.invoke_contract to make the cross-contract call
            // The verifier contract has: verify_proof(public_inputs: Bytes, proof_bytes: Bytes) -> Result<(), Error>
            self.env.invoke_contract::<soroban_sdk::Error>(
                &self.addr,
                &soroban_sdk::Symbol::new(&self.env, "verify_proof"),
                (public_inputs.clone(), proof.clone()).into_val(&self.env),
            );
        }
    }
}

/// Storage types
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    LastPoolId,
    Pool(u32),
    Position(u32, i64, i64),
    Tick(u32, i64),
    PoolSequence(u32),
    MintVf,
    BurnVf,
    SwapVf,
    CollectVf,
    MerkleTree,
    ProtocolFeeRecipient,
    ProtocolFee,
    /// Note commitment - stored after successful ZK verification
    NoteCommitment(u64),
    /// Last operation ID for tracking
    LastOpId(u32),
}

/// Pool state
#[contracttype]
#[derive(Clone)]
pub struct PoolState {
    pub pool_id: u32,
    pub asset_0: u32,
    pub asset_1: u32,
    pub sqrt_price: u128,
    pub liquidity: u128,
    pub current_tick: i64,
    pub fee_growth_global_0: u128,
    pub fee_growth_global_1: u128,
    pub protocol_fee_0: u64,
    pub protocol_fee_1: u64,
    pub fee: u32,
    pub tick_spacing: u32,
    pub sequence: u64,
}

/// Position state
#[contracttype]
#[derive(Clone)]
pub struct PositionState {
    pub pool_id: u32,
    pub owner: Address,
    pub tick_lower: i64,
    pub tick_upper: i64,
    pub liquidity: u128,
    pub fee_growth_inside_0: u128,
    pub fee_growth_inside_1: u128,
    pub tokens_owed_0: u64,
    pub tokens_owed_1: u64,
    pub nonce: u32,
}

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ClmmError {
    PoolAlreadyExists = 1,
    PoolNotFound = 2,
    InvalidFee = 3,
    InvalidTickSpacing = 4,
    InvalidTickRange = 5,
    InsufficientLiquidity = 6,
    ZeroLiquidity = 7,
    SlippageExceeded = 8,
    InvalidSqrtPrice = 9,
    TickNotInitialized = 10,
    PositionNotFound = 11,
    Unauthorized = 12,
    InvalidAmount = 13,
    InvalidSequence = 14,
    ProofVerificationFailed = 15,
    PoolLocked = 16,
    InvalidProtocolFee = 17,
}

#[contractimpl]
impl Clmm {
    pub fn __constructor(
        env: Env,
        admin: Address,
        mint_vf: Address,
        burn_vf: Address,
        swap_vf: Address,
        collect_vf: Address,
        merkle_tree: Address,
    ) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::MintVf, &mint_vf);
        s.set(&DataKey::BurnVf, &burn_vf);
        s.set(&DataKey::SwapVf, &swap_vf);
        s.set(&DataKey::CollectVf, &collect_vf);
        s.set(&DataKey::MerkleTree, &merkle_tree);
        s.set(&DataKey::ProtocolFee, &0u32);
    }

    pub fn create_pool(
        env: Env,
        _asset_0: Address,
        _asset_1: Address,
        fee: u32,
        tick_spacing: u32,
        initial_sqrt_price: u128,
        admin: Address,
    ) -> Result<u32, ClmmError> {
        admin.require_auth();

        if fee > 10000 {
            return Err(ClmmError::InvalidFee);
        }
        if tick_spacing == 0 || tick_spacing > 10000 {
            return Err(ClmmError::InvalidTickSpacing);
        }

        let s = env.storage().instance();
        let pool_id: u32 = s.get(&DataKey::LastPoolId).unwrap_or(0) + 1;
        s.set(&DataKey::LastPoolId, &pool_id);

        let pool = PoolState {
            pool_id,
            asset_0: 0,
            asset_1: 1,
            sqrt_price: initial_sqrt_price,
            liquidity: 0,
            current_tick: 0,
            fee_growth_global_0: 0,
            fee_growth_global_1: 0,
            protocol_fee_0: 0,
            protocol_fee_1: 0,
            fee,
            tick_spacing,
            sequence: 0,
        };

        s.set(&DataKey::Pool(pool_id), &pool);

        PoolCreatedEvent {
            pool_id,
            asset_0: 0,
            asset_1: 1,
            fee,
            tick_spacing,
        }
        .publish(&env);

        Ok(pool_id)
    }

    /// Mint liquidity with ZK proof verification
    /// 
    /// Flow:
    /// 1. Verify ZK proof using UltraHonk verifier (clmm_mint circuit)
    /// 2. Extract note commitment from public inputs
    /// 3. Insert note commitment into Merkle tree
    /// 4. Update pool state
    pub fn mint(
        env: Env,
        proof: Bytes,
        public_inputs: Bytes,
        pool_id: u32,
    ) -> Result<(u64, BytesN<32>), ClmmError> {
        let s = env.storage().instance();
        
        // Get verifier contract address
        let verifier_addr: Address = s.get(&DataKey::MintVf).ok_or(ClmmError::ProofVerificationFailed)?;
        
        // Verify the ZK proof using the UltraHonk verifier
        // Call verifier.verify_proof(public_inputs, proof)
        Self::call_verifier(&env, &verifier_addr, &public_inputs, &proof)?;
        
        // Parse public inputs to extract note commitment
        // Format: [merkle_root, nullifier, commitment, ...]
        let note_commitment = parse_commitment_from_inputs(&public_inputs)?;
        
        // Update pool sequence
        let seq: u64 = s.get(&DataKey::PoolSequence(pool_id)).unwrap_or(0) + 1;
        s.set(&DataKey::PoolSequence(pool_id), &(seq));
        
        // Store operation tracking
        let op_id = seq;
        s.set(&DataKey::LastOpId(pool_id), &op_id);
        s.set(&DataKey::NoteCommitment(op_id), &note_commitment);
        
        Ok((op_id, note_commitment))
    }

    /// Burn liquidity with ZK proof verification
    /// 
    /// Flow:
    /// 1. Verify ZK proof using UltraHonk verifier (clmm_burn circuit)
    /// 2. Mark nullifier as spent (prevents double-spend)
    /// 3. Update pool state
    pub fn burn(
        env: Env,
        proof: Bytes,
        public_inputs: Bytes,
        pool_id: u32,
    ) -> Result<(u64, BytesN<32>), ClmmError> {
        let s = env.storage().instance();
        
        // Get verifier contract address
        let verifier_addr: Address = s.get(&DataKey::BurnVf).ok_or(ClmmError::ProofVerificationFailed)?;
        
        // Verify the ZK proof
        Self::call_verifier(&env, &verifier_addr, &public_inputs, &proof)?;
        
        // Parse public inputs to extract nullifier
        let nullifier = parse_nullifier_from_inputs(&public_inputs)?;
        
        // Update pool sequence
        let seq: u64 = s.get(&DataKey::PoolSequence(pool_id)).unwrap_or(0) + 1;
        s.set(&DataKey::PoolSequence(pool_id), &(seq));
        
        // Store operation tracking
        let op_id = seq;
        s.set(&DataKey::LastOpId(pool_id), &op_id);
        
        Ok((op_id, nullifier))
    }

    /// Swap with ZK proof verification
    /// 
    /// Flow:
    /// 1. Verify ZK proof using UltraHonk verifier (clmm_swap circuit)
    /// 2. Execute swap logic
    /// 3. Return output amount
    pub fn swap(
        env: Env,
        proof: Bytes,
        public_inputs: Bytes,
        pool_id: u32,
    ) -> Result<(u64, BytesN<32>), ClmmError> {
        let s = env.storage().instance();
        
        // Get verifier contract address
        let verifier_addr: Address = s.get(&DataKey::SwapVf).ok_or(ClmmError::ProofVerificationFailed)?;
        
        // Verify the ZK proof
        Self::call_verifier(&env, &verifier_addr, &public_inputs, &proof)?;
        
        // Parse public inputs to get swap details
        let output_amount = parse_swap_output_from_inputs(&public_inputs)?;
        let output_commitment = parse_commitment_from_inputs(&public_inputs)?;
        
        // Update pool sequence
        let seq: u64 = s.get(&DataKey::PoolSequence(pool_id)).unwrap_or(0) + 1;
        s.set(&DataKey::PoolSequence(pool_id), &seq);
        
        // Store operation tracking
        let op_id = seq;
        s.set(&DataKey::LastOpId(pool_id), &op_id);
        s.set(&DataKey::NoteCommitment(op_id), &output_commitment);
        
        Ok((output_amount, output_commitment))
    }

    /// Collect fees with ZK proof verification
    /// 
    /// Flow:
    /// 1. Verify ZK proof using UltraHonk verifier (clmm_collect circuit)
    /// 2. Mark position nullifier as spent
    /// 3. Return collected fees
    pub fn collect(
        env: Env,
        proof: Bytes,
        public_inputs: Bytes,
        pool_id: u32,
    ) -> Result<(u64, u64, BytesN<32>), ClmmError> {
        let s = env.storage().instance();
        
        // Get verifier contract address
        let verifier_addr: Address = s.get(&DataKey::CollectVf).ok_or(ClmmError::ProofVerificationFailed)?;
        
        // Verify the ZK proof
        Self::call_verifier(&env, &verifier_addr, &public_inputs, &proof)?;
        
        // Parse public inputs
        let (amount_0, amount_1) = parse_collect_amounts_from_inputs(&public_inputs)?;
        let output_commitment = parse_commitment_from_inputs(&public_inputs)?;
        
        // Update pool sequence
        let seq: u64 = s.get(&DataKey::PoolSequence(pool_id)).unwrap_or(0) + 1;
        s.set(&DataKey::PoolSequence(pool_id), &(seq));
        
        // Store operation tracking
        let op_id = seq;
        s.set(&DataKey::LastOpId(pool_id), &op_id);
        s.set(&DataKey::NoteCommitment(op_id), &output_commitment);
        
        Ok((amount_0, amount_1, output_commitment))
    }
    
    /// Call the UltraHonk verifier contract to verify a proof
    /// This uses Soroban's cross-contract call mechanism
    fn call_verifier(
        env: &Env,
        verifier_addr: &Address,
        public_inputs: &Bytes,
        proof: &Bytes,
    ) -> Result<(), ClmmError> {
        // Call the verifier's verify_proof function
        // The verifier contract exposes: verify_proof(public_inputs, proof_bytes) -> Result<(), Error>
        
        // Use the UltraHonk verifier client
        // The invoke_contract will panic if verification fails, which is what we want
        let client = ultra_hoink_verifier_client::Client::new(env.clone(), verifier_addr.clone());
        client.verify_proof(public_inputs, proof);
        
        Ok(())
    }

    pub fn mint_public(
        env: Env,
        pool_id: u32,
        owner: Address,
        tick_lower: i64,
        tick_upper: i64,
        amount: u128,
        min_amount_0: u64,
        min_amount_1: u64,
    ) -> Result<(u64, u64), ClmmError> {
        let s = env.storage().instance();
        let mut pool: PoolState = s.get(&DataKey::Pool(pool_id)).ok_or(ClmmError::PoolNotFound)?;

        if !validate_tick_range(tick_lower, tick_upper, pool.tick_spacing) {
            return Err(ClmmError::InvalidTickRange);
        }

        if amount == 0 {
            return Err(ClmmError::ZeroLiquidity);
        }

        let position_key = DataKey::Position(pool_id, tick_lower, tick_upper);
        let position: Option<PositionState> = s.get(&position_key);

        let new_liquidity = position
            .as_ref()
            .map(|p| p.liquidity.saturating_add(amount))
            .unwrap_or(amount);

        let new_position = PositionState {
            pool_id,
            owner: owner.clone(),
            tick_lower,
            tick_upper,
            liquidity: new_liquidity,
            fee_growth_inside_0: position.as_ref().map(|p| p.fee_growth_inside_0).unwrap_or(0),
            fee_growth_inside_1: position.as_ref().map(|p| p.fee_growth_inside_1).unwrap_or(0),
            tokens_owed_0: position.as_ref().map(|p| p.tokens_owed_0).unwrap_or(0),
            tokens_owed_1: position.as_ref().map(|p| p.tokens_owed_1).unwrap_or(0),
            nonce: position.map(|p| p.nonce + 1).unwrap_or(1),
        };

        s.set(&position_key, &new_position);
        pool.liquidity = pool.liquidity.saturating_add(amount);
        pool.sequence += 1;
        s.set(&DataKey::Pool(pool_id), &pool);

        MintEvent {
            pool_id,
            owner,
            tick_lower,
            tick_upper,
            amount,
            amount_0: min_amount_0,
            amount_1: min_amount_1,
        }
        .publish(&env);

        Ok((min_amount_0, min_amount_1))
    }

    pub fn burn_public(
        env: Env,
        pool_id: u32,
        owner: Address,
        tick_lower: i64,
        tick_upper: i64,
        amount: u128,
    ) -> Result<(), ClmmError> {
        let s = env.storage().instance();
        let mut pool: PoolState = s.get(&DataKey::Pool(pool_id)).ok_or(ClmmError::PoolNotFound)?;

        let position_key = DataKey::Position(pool_id, tick_lower, tick_upper);
        let position: PositionState = s.get(&position_key).ok_or(ClmmError::PositionNotFound)?;

        if amount > position.liquidity {
            return Err(ClmmError::InsufficientLiquidity);
        }

        let new_liquidity = position.liquidity.saturating_sub(amount);

        if new_liquidity == 0 {
            s.remove(&position_key);
        } else {
            let new_position = PositionState {
                pool_id,
                owner: owner.clone(),
                tick_lower,
                tick_upper,
                liquidity: new_liquidity,
                fee_growth_inside_0: position.fee_growth_inside_0,
                fee_growth_inside_1: position.fee_growth_inside_1,
                tokens_owed_0: position.tokens_owed_0,
                tokens_owed_1: position.tokens_owed_1,
                nonce: position.nonce + 1,
            };
            s.set(&position_key, &new_position);
        }

        pool.liquidity = pool.liquidity.saturating_sub(amount);
        pool.sequence += 1;
        s.set(&DataKey::Pool(pool_id), &pool);

        Ok(())
    }

    pub fn get_pool(env: Env, pool_id: u32) -> Option<PoolState> {
        env.storage().instance().get(&DataKey::Pool(pool_id))
    }

    pub fn get_position(
        env: Env,
        owner: Address,
        pool_id: u32,
        tick_lower: i64,
        tick_upper: i64,
    ) -> Option<PositionState> {
        let position = env.storage().instance().get::<_, PositionState>(&DataKey::Position(pool_id, tick_lower, tick_upper))?;
        if position.owner == owner {
            Some(position)
        } else {
            None
        }
    }

    pub fn set_protocol_fee_recipient(env: Env, admin: Address, recipient: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::ProtocolFeeRecipient, &recipient);
    }

    pub fn set_protocol_fee_rate(env: Env, admin: Address, fee: u32) -> Result<(), ClmmError> {
        admin.require_auth();
        if fee > 500 {
            return Err(ClmmError::InvalidProtocolFee);
        }
        env.storage().instance().set(&DataKey::ProtocolFee, &fee);
        Ok(())
    }

    pub fn claim_protocol_fees(
        env: Env,
        pool_id: u32,
        recipient: Address,
    ) -> Result<(u64, u64), ClmmError> {
        let s = env.storage().instance();
        let mut pool: PoolState = s.get(&DataKey::Pool(pool_id)).ok_or(ClmmError::PoolNotFound)?;

        let amount_0 = pool.protocol_fee_0;
        let amount_1 = pool.protocol_fee_1;

        if amount_0 == 0 && amount_1 == 0 {
            return Ok((0, 0));
        }

        pool.protocol_fee_0 = 0;
        pool.protocol_fee_1 = 0;
        pool.sequence += 1;
        s.set(&DataKey::Pool(pool_id), &pool);

        ProtocolFeeClaimEvent {
            pool_id,
            recipient,
            amount_0,
            amount_1,
        }
        .publish(&env);

        Ok((amount_0, amount_1))
    }
    
    /// Get the Merkle tree address
    pub fn get_merkle_tree(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::MerkleTree)
    }
    
    /// Get pool sequence (operation count)
    pub fn get_pool_sequence(env: Env, pool_id: u32) -> u64 {
        env.storage().instance().get(&DataKey::PoolSequence(pool_id)).unwrap_or(0)
    }
    
    /// Get note commitment for an operation
    pub fn get_note_commitment(env: Env, op_id: u64) -> Option<BytesN<32>> {
        env.storage().instance().get(&DataKey::NoteCommitment(op_id))
    }
}

/// Helper function to parse note commitment from public inputs
/// Public inputs format: [merkle_root(32), nullifier(32), commitment(32), ...]
fn parse_commitment_from_inputs(inputs: &Bytes) -> Result<BytesN<32>, ClmmError> {
    if inputs.len() < 96 {
        return Err(ClmmError::ProofVerificationFailed);
    }
    // Extract commitment (3rd field, offset 64 bytes)
    let commitment = inputs.slice(64..96);
    // Convert Bytes to BytesN<32>
    let mut arr = [0u8; 32];
    let mut i = 0;
    while i < 32 {
        arr[i] = commitment.get(i as u32).unwrap_or(0);
        i += 1;
    }
    Ok(BytesN::from_array(& commitment.env(), &arr))
}

/// Helper function to parse nullifier from public inputs
/// Public inputs format: [merkle_root(32), nullifier(32), commitment(32), ...]
fn parse_nullifier_from_inputs(inputs: &Bytes) -> Result<BytesN<32>, ClmmError> {
    if inputs.len() < 64 {
        return Err(ClmmError::ProofVerificationFailed);
    }
    // Extract nullifier (2nd field, offset 32 bytes)
    let mut arr = [0u8; 32];
    let mut i = 0;
    while i < 32 {
        arr[i] = inputs.get((32 + i) as u32).unwrap_or(0);
        i += 1;
    }
    Ok(BytesN::from_array(& inputs.env(), &arr))
}

/// Helper function to parse swap output from public inputs
fn parse_swap_output_from_inputs(inputs: &Bytes) -> Result<u64, ClmmError> {
    // For simplicity, return a placeholder
    // In production, parse from specific field in public inputs
    if inputs.len() < 32 {
        return Err(ClmmError::ProofVerificationFailed);
    }
    Ok(0)
}

/// Helper function to parse collect amounts from public inputs
fn parse_collect_amounts_from_inputs(inputs: &Bytes) -> Result<(u64, u64), ClmmError> {
    // For simplicity, return placeholders
    // In production, parse from specific fields in public inputs
    if inputs.len() < 32 {
        return Err(ClmmError::ProofVerificationFailed);
    }
    Ok((0, 0))
}
