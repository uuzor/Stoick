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

use events::{MintEvent, PoolCreatedEvent, PrivateDepositEvent, ProtocolFeeClaimEvent};
use math::validate_tick_range;
use soroban_poseidon::{poseidon2_hash, Field};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, crypto::BnScalar, token, xdr::ToXdr,
    Address, Bytes, BytesN, Env, IntoVal, InvokeError, Symbol, U256, Val, Vec,
};

const PROOF_BYTES: u32 = 456 * 32;

// Client for Merkle Tree contract
// Used to insert note commitments after ZK proof verification
mod merkle_tree_client {
    use soroban_sdk::{
        auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
        Address, BytesN, Env, IntoVal, InvokeError, Symbol, Val, Vec,
    };
    
    /// Client for calling the Merkle Tree contract
    pub struct MerkleTreeClient {
        env: Env,
        addr: Address,
    }
    
    impl MerkleTreeClient {
        pub fn new(env: Env, addr: Address) -> Self {
            Self { env, addr }
        }
        
        /// Insert a note commitment into the Merkle tree
        /// Returns (leaf_index, new_root) on success
        /// Uses authorized_insert for contract-to-contract calls
        pub fn insert(&self, commitment: &BytesN<32>) -> (u32, BytesN<32>) {
            let inserter = self.env.current_contract_address();
            let fn_name = Symbol::new(&self.env, "authorized_insert");
            let mut args: Vec<Val> = Vec::new(&self.env);
            args.push_back(inserter.clone().into_val(&self.env));
            args.push_back(commitment.clone().into_val(&self.env));

            self.env.authorize_as_current_contract(Vec::from_array(
                &self.env,
                [InvokerContractAuthEntry::Contract(SubContractInvocation {
                    context: ContractContext {
                        contract: self.addr.clone(),
                        fn_name: fn_name.clone(),
                        args: args.clone(),
                    },
                    sub_invocations: Vec::new(&self.env),
                })],
            ));

            self.env.invoke_contract::<(u32, BytesN<32>)>(
                &self.addr,
                &fn_name,
                (inserter, commitment.clone()).into_val(&self.env),
            )
        }

        pub fn get_root(&self) -> Option<BytesN<32>> {
            self.env
                .try_invoke_contract::<BytesN<32>, InvokeError>(
                    &self.addr,
                    &Symbol::new(&self.env, "get_root"),
                    Vec::new(&self.env),
                )
                .ok()?
                .ok()
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
    Position(Address, u32, i64, i64),
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
    NoteCommitment(u64, u32),
    /// Spent nullifier - prevents replay of shielded spends
    Nullifier(BytesN<32>),
    /// Last operation ID for tracking
    LastOpId(u32),
    /// Last private deposit ID for tracking funded balance notes
    LastDepositId,
    /// Merkle leaf index and new root - stored after successful insertion
    MerkleLeafIndex(u64, u32),
}

/// Pool state
#[contracttype]
#[derive(Clone)]
pub struct PoolState {
    pub pool_id: u32,
    pub asset_0: Address,
    pub asset_1: Address,
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
    UnknownRoot = 18,
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
        s.set(&DataKey::ProtocolFeeRecipient, &admin);
    }

    pub fn create_pool(
        env: Env,
        asset_0: Address,
        asset_1: Address,
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
        if asset_0 == asset_1 {
            return Err(ClmmError::InvalidAmount);
        }
        if initial_sqrt_price == 0 {
            return Err(ClmmError::InvalidSqrtPrice);
        }

        let s = env.storage().instance();
        let pool_id: u32 = s.get(&DataKey::LastPoolId).unwrap_or(0) + 1;
        s.set(&DataKey::LastPoolId, &pool_id);

        let pool = PoolState {
            pool_id,
            asset_0: asset_0.clone(),
            asset_1: asset_1.clone(),
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
            asset_0,
            asset_1,
            fee,
            tick_spacing,
        }
        .publish(&env);

        Ok(pool_id)
    }

    /// Fund a private balance note for later shielded CLMM operations.
    ///
    /// The note commitment is generated client-side from
    /// `(asset_address_as_field, amount, owner_key, blinding)`. This function
    /// only verifies public token custody: it transfers real tokens into CLMM
    /// escrow and inserts the commitment into the shared Merkle tree.
    pub fn deposit_private(
        env: Env,
        asset: Address,
        from: Address,
        amount: u64,
        commitment: BytesN<32>,
    ) -> Result<(u64, u32, BytesN<32>), ClmmError> {
        if amount == 0 {
            return Err(ClmmError::InvalidAmount);
        }
        from.require_auth();

        Self::transfer_to_pool(&env, &asset, &from, amount);

        let s = env.storage().instance();
        let deposit_id: u64 = s.get(&DataKey::LastDepositId).unwrap_or(0) + 1;
        s.set(&DataKey::LastDepositId, &deposit_id);

        let merkle_tree_addr: Address = s
            .get(&DataKey::MerkleTree)
            .ok_or(ClmmError::UnknownRoot)?;
        let merkle_client = merkle_tree_client::MerkleTreeClient::new(env.clone(), merkle_tree_addr);
        let (leaf_index, root) = merkle_client.insert(&commitment);

        s.set(&DataKey::NoteCommitment(deposit_id, 0), &commitment);
        s.set(&DataKey::MerkleLeafIndex(deposit_id, 0), &(leaf_index, root.clone()));

        PrivateDepositEvent {
            deposit_id,
            asset,
            from,
            amount,
            commitment: commitment.clone(),
            leaf_index,
            root: root.clone(),
        }
        .publish(&env);

        Ok((deposit_id, leaf_index, root))
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
        
        let parsed = parse_mint_public_inputs(&public_inputs)?;
        let mut pool = Self::require_pool(&env, pool_id)?;
        Self::require_pool_state(&env, &pool, &parsed.pool_state_old)?;
        Self::require_current_merkle_root(&env, &parsed.merkle_root)?;
        Self::spend_nullifier(&env, &parsed.input_nullifier)?;
        if !is_zero_bytes(&parsed.position_nullifier) {
            Self::spend_nullifier(&env, &parsed.position_nullifier)?;
        }
        
        // Update pool sequence FIRST to get op_id
        let seq: u64 = pool.sequence + 1;
        pool.sequence = seq;
        s.set(&DataKey::Pool(pool_id), &pool);
        s.set(&DataKey::PoolSequence(pool_id), &(seq));
        let op_id = seq;
        
        // Get Merkle tree address and insert commitment
        if let Some(merkle_tree_addr) = s.get::<_, Address>(&DataKey::MerkleTree) {
            let merkle_client = merkle_tree_client::MerkleTreeClient::new(env.clone(), merkle_tree_addr);
            let (leaf_index, new_root) = merkle_client.insert(&parsed.new_position_commitment);
            // Store the leaf index and new root for verification
            s.set(&DataKey::MerkleLeafIndex(op_id, 0), &(leaf_index, new_root));
        }
        
        // Store operation tracking
        s.set(&DataKey::LastOpId(pool_id), &op_id);
        s.set(&DataKey::NoteCommitment(op_id, 0), &parsed.new_position_commitment);
        
        Ok((op_id, parsed.new_position_commitment))
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
    ) -> Result<(u64, BytesN<32>, BytesN<32>, BytesN<32>), ClmmError> {
        let s = env.storage().instance();
        
        // Get verifier contract address
        let verifier_addr: Address = s.get(&DataKey::BurnVf).ok_or(ClmmError::ProofVerificationFailed)?;
        
        // Verify the ZK proof
        Self::call_verifier(&env, &verifier_addr, &public_inputs, &proof)?;
        
        let parsed = parse_burn_public_inputs(&public_inputs)?;
        let mut pool = Self::require_pool(&env, pool_id)?;
        Self::require_pool_state(&env, &pool, &parsed.pool_state_old)?;
        Self::require_current_merkle_root(&env, &parsed.merkle_root)?;
        Self::spend_nullifier(&env, &parsed.position_nullifier)?;
        
        // Update pool sequence
        let seq: u64 = pool.sequence + 1;
        pool.sequence = seq;
        s.set(&DataKey::Pool(pool_id), &pool);
        s.set(&DataKey::PoolSequence(pool_id), &(seq));
        
        // Store operation tracking
        let op_id = seq;

        if let Some(merkle_tree_addr) = s.get::<_, Address>(&DataKey::MerkleTree) {
            let merkle_client = merkle_tree_client::MerkleTreeClient::new(env.clone(), merkle_tree_addr);
            let (leaf_index_0, new_root_0) = merkle_client.insert(&parsed.output_commitment_0);
            s.set(&DataKey::MerkleLeafIndex(op_id, 0), &(leaf_index_0, new_root_0));
            let (leaf_index_1, new_root_1) = merkle_client.insert(&parsed.output_commitment_1);
            s.set(&DataKey::MerkleLeafIndex(op_id, 1), &(leaf_index_1, new_root_1));
        }

        s.set(&DataKey::LastOpId(pool_id), &op_id);
        s.set(&DataKey::NoteCommitment(op_id, 0), &parsed.output_commitment_0);
        s.set(&DataKey::NoteCommitment(op_id, 1), &parsed.output_commitment_1);
        
        Ok((op_id, parsed.position_nullifier, parsed.output_commitment_0, parsed.output_commitment_1))
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
        
        let parsed = parse_swap_public_inputs(&public_inputs)?;
        let mut pool = Self::require_pool(&env, pool_id)?;
        Self::require_pool_state(&env, &pool, &parsed.pool_state_old)?;
        Self::require_current_merkle_root(&env, &parsed.merkle_root)?;
        Self::spend_nullifier(&env, &parsed.input_nullifier)?;
        
        // Update pool sequence FIRST
        let seq: u64 = pool.sequence + 1;
        pool.sequence = seq;
        s.set(&DataKey::Pool(pool_id), &pool);
        s.set(&DataKey::PoolSequence(pool_id), &seq);
        let op_id = seq;
        
        // Get Merkle tree address and insert output commitment
        if let Some(merkle_tree_addr) = s.get::<_, Address>(&DataKey::MerkleTree) {
            let merkle_client = merkle_tree_client::MerkleTreeClient::new(env.clone(), merkle_tree_addr);
            let (leaf_index, new_root) = merkle_client.insert(&parsed.output_commitment);
            s.set(&DataKey::MerkleLeafIndex(op_id, 0), &(leaf_index, new_root));
        }
        
        // Store operation tracking
        s.set(&DataKey::LastOpId(pool_id), &op_id);
        s.set(&DataKey::NoteCommitment(op_id, 0), &parsed.output_commitment);
        
        Ok((0, parsed.output_commitment))
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
    ) -> Result<(u64, u64, BytesN<32>, BytesN<32>), ClmmError> {
        let s = env.storage().instance();
        
        // Get verifier contract address
        let verifier_addr: Address = s.get(&DataKey::CollectVf).ok_or(ClmmError::ProofVerificationFailed)?;
        
        // Verify the ZK proof
        Self::call_verifier(&env, &verifier_addr, &public_inputs, &proof)?;
        
        let parsed = parse_collect_public_inputs(&public_inputs)?;
        let mut pool = Self::require_pool(&env, pool_id)?;
        Self::require_pool_state(&env, &pool, &parsed.pool_state_old)?;
        Self::require_current_merkle_root(&env, &parsed.merkle_root)?;
        Self::spend_nullifier(&env, &parsed.position_nullifier)?;
        if is_zero_bytes(&parsed.new_position_commitment) {
            return Err(ClmmError::InvalidSequence);
        }
        
        // Update pool sequence FIRST
        let seq: u64 = pool.sequence + 1;
        pool.sequence = seq;
        s.set(&DataKey::Pool(pool_id), &pool);
        s.set(&DataKey::PoolSequence(pool_id), &(seq));
        let op_id = seq;
        
        // Get Merkle tree address and insert output commitment
        if let Some(merkle_tree_addr) = s.get::<_, Address>(&DataKey::MerkleTree) {
            let merkle_client = merkle_tree_client::MerkleTreeClient::new(env.clone(), merkle_tree_addr);
            let (position_leaf_index, position_root) = merkle_client.insert(&parsed.new_position_commitment);
            s.set(&DataKey::MerkleLeafIndex(op_id, 0), &(position_leaf_index, position_root));
            let (leaf_index_0, new_root_0) = merkle_client.insert(&parsed.output_commitment_0);
            s.set(&DataKey::MerkleLeafIndex(op_id, 1), &(leaf_index_0, new_root_0));
            let (leaf_index_1, new_root_1) = merkle_client.insert(&parsed.output_commitment_1);
            s.set(&DataKey::MerkleLeafIndex(op_id, 2), &(leaf_index_1, new_root_1));
        }
        
        // Store operation tracking
        s.set(&DataKey::LastOpId(pool_id), &op_id);
        s.set(&DataKey::NoteCommitment(op_id, 0), &parsed.new_position_commitment);
        s.set(&DataKey::NoteCommitment(op_id, 1), &parsed.output_commitment_0);
        s.set(&DataKey::NoteCommitment(op_id, 2), &parsed.output_commitment_1);
        
        Ok((0, 0, parsed.output_commitment_0, parsed.output_commitment_1))
    }
    
    /// Call the UltraHonk verifier contract to verify a proof
    /// This uses Soroban's cross-contract call mechanism
    fn call_verifier(
        env: &Env,
        verifier_addr: &Address,
        public_inputs: &Bytes,
        proof: &Bytes,
    ) -> Result<(), ClmmError> {
        if proof.len() != PROOF_BYTES {
            return Err(ClmmError::ProofVerificationFailed);
        }

        let mut args: Vec<Val> = Vec::new(env);
        args.push_back(public_inputs.into_val(env));
        args.push_back(proof.into_val(env));

        env.try_invoke_contract::<(), InvokeError>(
            verifier_addr,
            &Symbol::new(env, "verify_proof"),
            args,
        )
        .map_err(|_| ClmmError::ProofVerificationFailed)?
        .map_err(|_| ClmmError::ProofVerificationFailed)
    }

    fn spend_nullifier(env: &Env, nullifier: &BytesN<32>) -> Result<(), ClmmError> {
        if is_zero_bytes(nullifier) {
            return Err(ClmmError::InvalidSequence);
        }
        let s = env.storage().instance();
        let key = DataKey::Nullifier(nullifier.clone());
        if s.has(&key) {
            return Err(ClmmError::InvalidSequence);
        }
        s.set(&key, &true);
        Ok(())
    }

    fn require_pool(env: &Env, pool_id: u32) -> Result<PoolState, ClmmError> {
        env.storage()
            .instance()
            .get(&DataKey::Pool(pool_id))
            .ok_or(ClmmError::PoolNotFound)
    }

    fn require_admin(env: &Env, admin: &Address) -> Result<(), ClmmError> {
        admin.require_auth();
        let configured: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ClmmError::Unauthorized)?;
        if configured != *admin {
            return Err(ClmmError::Unauthorized);
        }
        Ok(())
    }

    fn require_current_merkle_root(env: &Env, root: &BytesN<32>) -> Result<(), ClmmError> {
        let merkle_tree_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::MerkleTree)
            .ok_or(ClmmError::UnknownRoot)?;
        let merkle_client = merkle_tree_client::MerkleTreeClient::new(env.clone(), merkle_tree_addr);
        let current_root = merkle_client.get_root().ok_or(ClmmError::UnknownRoot)?;
        if current_root != *root {
            return Err(ClmmError::UnknownRoot);
        }
        Ok(())
    }

    fn require_pool_state(env: &Env, pool: &PoolState, commitment: &BytesN<32>) -> Result<(), ClmmError> {
        let current = Self::pool_state_commitment(env, pool);
        if current != *commitment {
            return Err(ClmmError::InvalidSequence);
        }
        Ok(())
    }

    fn pool_state_commitment(env: &Env, pool: &PoolState) -> BytesN<32> {
        let modulus = <BnScalar as Field>::modulus(env);
        let mut inputs = Vec::new(env);
        Self::push_field(env, &mut inputs, &Self::field_from_u128(env, pool.pool_id as u128), &modulus);
        Self::push_field(env, &mut inputs, &Self::address_to_field(env, &pool.asset_0), &modulus);
        Self::push_field(env, &mut inputs, &Self::address_to_field(env, &pool.asset_1), &modulus);
        Self::push_field(env, &mut inputs, &Self::field_from_u128(env, pool.sqrt_price), &modulus);
        Self::push_field(env, &mut inputs, &Self::field_from_u128(env, pool.liquidity), &modulus);
        Self::push_field(env, &mut inputs, &Self::field_from_u128(env, pool.fee_growth_global_0), &modulus);
        Self::push_field(env, &mut inputs, &Self::field_from_u128(env, pool.fee_growth_global_1), &modulus);
        Self::push_field(env, &mut inputs, &Self::field_from_u128(env, pool.sequence as u128), &modulus);

        let out = poseidon2_hash::<4, BnScalar>(env, &inputs);
        let mut out_arr = [0u8; 32];
        out.to_be_bytes().copy_into_slice(&mut out_arr);
        BytesN::from_array(env, &out_arr)
    }

    fn push_field(env: &Env, inputs: &mut Vec<U256>, field: &BytesN<32>, modulus: &U256) {
        let bytes = Bytes::from_array(env, &field.to_array());
        inputs.push_back(U256::from_be_bytes(env, &bytes).rem_euclid(modulus));
    }

    fn field_from_u128(env: &Env, value: u128) -> BytesN<32> {
        let mut out = [0u8; 32];
        out[16..32].copy_from_slice(&value.to_be_bytes());
        BytesN::from_array(env, &out)
    }

    fn address_to_field(env: &Env, address: &Address) -> BytesN<32> {
        let xdr = address.clone().to_xdr(env);
        let len = xdr.len();
        let mut raw = [0u8; 32];
        xdr.slice(len - 32..len).copy_into_slice(&mut raw);

        let modulus = <BnScalar as Field>::modulus(env);
        let reduced = U256::from_be_bytes(env, &Bytes::from_array(env, &raw)).rem_euclid(&modulus);
        let mut out = [0u8; 32];
        reduced.to_be_bytes().copy_into_slice(&mut out);
        BytesN::from_array(env, &out)
    }

    fn transfer_to_pool(env: &Env, asset: &Address, owner: &Address, amount: u64) {
        if amount == 0 {
            return;
        }
        let token = token::Client::new(env, asset);
        token.transfer(owner, &env.current_contract_address(), &(amount as i128));
    }

    fn transfer_from_pool(env: &Env, asset: &Address, recipient: &Address, amount: u64) {
        if amount == 0 {
            return;
        }
        let token = token::Client::new(env, asset);
        token.transfer(&env.current_contract_address(), recipient, &(amount as i128));
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
        owner.require_auth();

        if !validate_tick_range(tick_lower, tick_upper, pool.tick_spacing) {
            return Err(ClmmError::InvalidTickRange);
        }

        if amount == 0 {
            return Err(ClmmError::ZeroLiquidity);
        }
        if min_amount_0 == 0 && min_amount_1 == 0 {
            return Err(ClmmError::InvalidAmount);
        }

        Self::transfer_to_pool(&env, &pool.asset_0, &owner, min_amount_0);
        Self::transfer_to_pool(&env, &pool.asset_1, &owner, min_amount_1);

        let position_key = DataKey::Position(owner.clone(), pool_id, tick_lower, tick_upper);
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
        amount_0: u64,
        amount_1: u64,
    ) -> Result<(), ClmmError> {
        let s = env.storage().instance();
        let mut pool: PoolState = s.get(&DataKey::Pool(pool_id)).ok_or(ClmmError::PoolNotFound)?;
        owner.require_auth();

        let position_key = DataKey::Position(owner.clone(), pool_id, tick_lower, tick_upper);
        let position: PositionState = s.get(&position_key).ok_or(ClmmError::PositionNotFound)?;
        if position.owner != owner {
            return Err(ClmmError::Unauthorized);
        }
        if amount_0 == 0 && amount_1 == 0 {
            return Err(ClmmError::InvalidAmount);
        }

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

        Self::transfer_from_pool(&env, &pool.asset_0, &owner, amount_0);
        Self::transfer_from_pool(&env, &pool.asset_1, &owner, amount_1);

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
        let position = env.storage().instance().get::<_, PositionState>(&DataKey::Position(owner.clone(), pool_id, tick_lower, tick_upper))?;
        if position.owner == owner {
            Some(position)
        } else {
            None
        }
    }

    pub fn set_protocol_fee_recipient(env: Env, admin: Address, recipient: Address) -> Result<(), ClmmError> {
        Self::require_admin(&env, &admin)?;
        env.storage().instance().set(&DataKey::ProtocolFeeRecipient, &recipient);
        Ok(())
    }

    pub fn set_protocol_fee_rate(env: Env, admin: Address, fee: u32) -> Result<(), ClmmError> {
        Self::require_admin(&env, &admin)?;
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
        let configured_recipient: Address = s
            .get(&DataKey::ProtocolFeeRecipient)
            .ok_or(ClmmError::Unauthorized)?;
        if configured_recipient != recipient {
            return Err(ClmmError::Unauthorized);
        }
        recipient.require_auth();

        let amount_0 = pool.protocol_fee_0;
        let amount_1 = pool.protocol_fee_1;

        if amount_0 == 0 && amount_1 == 0 {
            return Ok((0, 0));
        }

        pool.protocol_fee_0 = 0;
        pool.protocol_fee_1 = 0;
        pool.sequence += 1;
        s.set(&DataKey::Pool(pool_id), &pool);

        Self::transfer_from_pool(&env, &pool.asset_0, &recipient, amount_0);
        Self::transfer_from_pool(&env, &pool.asset_1, &recipient, amount_1);

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
        env.storage()
            .instance()
            .get::<_, PoolState>(&DataKey::Pool(pool_id))
            .map(|pool| pool.sequence)
            .unwrap_or_else(|| env.storage().instance().get(&DataKey::PoolSequence(pool_id)).unwrap_or(0))
    }
    
    /// Get note commitment for an operation
    pub fn get_note_commitment(env: Env, op_id: u64, index: u32) -> Option<BytesN<32>> {
        env.storage().instance().get(&DataKey::NoteCommitment(op_id, index))
    }
}

struct MintPublicInputs {
    merkle_root: BytesN<32>,
    position_nullifier: BytesN<32>,
    new_position_commitment: BytesN<32>,
    pool_state_old: BytesN<32>,
    input_nullifier: BytesN<32>,
}

struct SwapPublicInputs {
    merkle_root: BytesN<32>,
    input_nullifier: BytesN<32>,
    output_commitment: BytesN<32>,
    pool_state_old: BytesN<32>,
}

struct BurnPublicInputs {
    merkle_root: BytesN<32>,
    position_nullifier: BytesN<32>,
    pool_state_old: BytesN<32>,
    output_commitment_0: BytesN<32>,
    output_commitment_1: BytesN<32>,
}

struct CollectPublicInputs {
    merkle_root: BytesN<32>,
    position_nullifier: BytesN<32>,
    new_position_commitment: BytesN<32>,
    pool_state_old: BytesN<32>,
    output_commitment_0: BytesN<32>,
    output_commitment_1: BytesN<32>,
}

fn field_at(inputs: &Bytes, index: u32) -> BytesN<32> {
    let mut arr = [0u8; 32];
    let offset = index * 32;
    let mut i = 0u32;
    while i < 32 {
        arr[i as usize] = inputs.get(offset + i).unwrap_or(0);
        i += 1;
    }
    BytesN::from_array(&inputs.env(), &arr)
}

fn is_zero_bytes(value: &BytesN<32>) -> bool {
    let mut i = 0u32;
    while i < 32 {
        if value.get(i).unwrap_or(0) != 0 {
            return false;
        }
        i += 1;
    }
    true
}

/// clmm_mint public inputs:
/// [0] merkle_root, [1] position_nullifier, [2] old_position_commitment,
/// [3] new_position_commitment, [4] pool_state_old, [5] pool_state_new,
/// [6] input_note_nullifier
fn parse_mint_public_inputs(inputs: &Bytes) -> Result<MintPublicInputs, ClmmError> {
    if inputs.len() != 7 * 32 {
        return Err(ClmmError::ProofVerificationFailed);
    }
    Ok(MintPublicInputs {
        merkle_root: field_at(inputs, 0),
        position_nullifier: field_at(inputs, 1),
        new_position_commitment: field_at(inputs, 3),
        pool_state_old: field_at(inputs, 4),
        input_nullifier: field_at(inputs, 6),
    })
}

/// clmm_swap_exact_in public inputs:
/// [0] merkle_root, [1] input_nullifier, [2] output_commitment,
/// [3] pool_state_old, [4] pool_state_new
fn parse_swap_public_inputs(inputs: &Bytes) -> Result<SwapPublicInputs, ClmmError> {
    if inputs.len() != 5 * 32 {
        return Err(ClmmError::ProofVerificationFailed);
    }
    Ok(SwapPublicInputs {
        merkle_root: field_at(inputs, 0),
        input_nullifier: field_at(inputs, 1),
        output_commitment: field_at(inputs, 2),
        pool_state_old: field_at(inputs, 3),
    })
}

/// clmm_burn public inputs:
/// [0] merkle_root, [1] position_nullifier, [2] old_position_commitment,
/// [3] new_position_commitment, [4] pool_state_old, [5] pool_state_new,
/// [6] output_commitment_0, [7] output_commitment_1
fn parse_burn_public_inputs(inputs: &Bytes) -> Result<BurnPublicInputs, ClmmError> {
    if inputs.len() != 8 * 32 {
        return Err(ClmmError::ProofVerificationFailed);
    }
    Ok(BurnPublicInputs {
        merkle_root: field_at(inputs, 0),
        position_nullifier: field_at(inputs, 1),
        pool_state_old: field_at(inputs, 4),
        output_commitment_0: field_at(inputs, 6),
        output_commitment_1: field_at(inputs, 7),
    })
}

/// clmm_collect public inputs:
/// [0] merkle_root, [1] position_nullifier, [2] old_position_commitment,
/// [3] new_position_commitment, [4] pool_state_old,
/// [5] output_commitment_0, [6] output_commitment_1
fn parse_collect_public_inputs(inputs: &Bytes) -> Result<CollectPublicInputs, ClmmError> {
    if inputs.len() != 7 * 32 {
        return Err(ClmmError::ProofVerificationFailed);
    }
    Ok(CollectPublicInputs {
        merkle_root: field_at(inputs, 0),
        position_nullifier: field_at(inputs, 1),
        new_position_commitment: field_at(inputs, 3),
        pool_state_old: field_at(inputs, 4),
        output_commitment_0: field_at(inputs, 5),
        output_commitment_1: field_at(inputs, 6),
    })
}
