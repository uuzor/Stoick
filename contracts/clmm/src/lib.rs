//! Wraith CLMM Contract
//!
//! Fully Shielded Concentrated Liquidity Market Maker for Stellar.

#![no_std]

mod events;
mod math;
mod types;

#[contract]
pub struct Clmm;

use events::{CollectEvent, MintEvent, PoolCreatedEvent, ProtocolFeeClaimEvent};
use math::validate_tick_range;
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, Address, Bytes, BytesN, Env,
};

// Verifier contract interface
// Uses the real UltraHonkVerifierContract from rs-soroban-ultrahonk
mod verifier {
    use soroban_sdk::{contracterror, Address, Bytes, Env};
    
    #[contracterror]
    #[repr(u32)]
    #[derive(Copy, Clone, Debug, Eq, PartialEq)]
    pub enum VerifierError {
        VkInvalidLength = 1,
        VkInvalidParameters = 2,
        ProofParseError = 3,
        VerificationFailed = 4,
        VkNotSet = 5,
        AlreadyInitialized = 6,
    }
    
    // Client trait for the UltraHonkVerifierContract
    pub trait VerifierClientTrait {
        fn verify_mint(env: &Env, contract_id: &Address, public_inputs: &Bytes, proof: &Bytes) -> Result<(), VerifierError>;
        fn verify_burn(env: &Env, contract_id: &Address, public_inputs: &Bytes, proof: &Bytes) -> Result<(), VerifierError>;
        fn verify_swap(env: &Env, contract_id: &Address, public_inputs: &Bytes, proof: &Bytes) -> Result<(), VerifierError>;
        fn verify_collect(env: &Env, contract_id: &Address, public_inputs: &Bytes, proof: &Bytes) -> Result<(), VerifierError>;
    }
    
    // UltraHonkVerifierClient calls the actual rs-soroban-ultrahonk contract
    // Uses the verify_proof(public_inputs, proof) function
    pub struct UltraHonkVerifierClient;
    
    impl VerifierClientTrait for UltraHonkVerifierClient {
        fn verify_mint(env: &Env, contract_id: &Address, public_inputs: &Bytes, proof: &Bytes) -> Result<(), VerifierError> {
            // Call UltraHonkVerifierContract at contract_id
            // verify_proof(public_inputs, proof) -> Result<(), Error>
            // TODO: Implement actual contract call
            Ok(())
        }
        fn verify_burn(env: &Env, contract_id: &Address, public_inputs: &Bytes, proof: &Bytes) -> Result<(), VerifierError> { Ok(()) }
        fn verify_swap(env: &Env, contract_id: &Address, public_inputs: &Bytes, proof: &Bytes) -> Result<(), VerifierError> { Ok(()) }
        fn verify_collect(env: &Env, contract_id: &Address, public_inputs: &Bytes, proof: &Bytes) -> Result<(), VerifierError> { Ok(()) }
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
    ProtocolFeeRecipient,
    ProtocolFee,
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
    ) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::MintVf, &mint_vf);
        s.set(&DataKey::BurnVf, &burn_vf);
        s.set(&DataKey::SwapVf, &swap_vf);
        s.set(&DataKey::CollectVf, &collect_vf);
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

    pub fn mint(
        env: Env,
        proof: Bytes,
        public_inputs: Bytes,
        pool_id: u32,
    ) -> Result<(), ClmmError> {
        let s = env.storage().instance();
        
        // Get verifier contract address
        let _verifier_addr: Address = s.get(&DataKey::MintVf).ok_or(ClmmError::ProofVerificationFailed)?;
        
        // TODO: Call the actual UltraHonkVerifierContract
        // client.verify_mint(&env, &public_inputs, &proof)
        //     .map_err(|_| ClmmError::ProofVerificationFailed)?;
        
        let seq: u64 = s.get(&DataKey::PoolSequence(pool_id)).unwrap_or(0);
        s.set(&DataKey::PoolSequence(pool_id), &(seq + 1));
        Ok(())
    }

    pub fn burn(
        env: Env,
        proof: Bytes,
        public_inputs: Bytes,
        pool_id: u32,
    ) -> Result<(), ClmmError> {
        let s = env.storage().instance();
        
        // Get verifier contract address
        let _verifier_addr: Address = s.get(&DataKey::BurnVf).ok_or(ClmmError::ProofVerificationFailed)?;
        
        // TODO: Call the actual UltraHonkVerifierContract
        
        let seq: u64 = s.get(&DataKey::PoolSequence(pool_id)).unwrap_or(0);
        s.set(&DataKey::PoolSequence(pool_id), &(seq + 1));
        Ok(())
    }

    pub fn swap(
        env: Env,
        proof: Bytes,
        public_inputs: Bytes,
        pool_id: u32,
    ) -> Result<u64, ClmmError> {
        let s = env.storage().instance();
        
        // Get verifier contract address
        let _verifier_addr: Address = s.get(&DataKey::SwapVf).ok_or(ClmmError::ProofVerificationFailed)?;
        
        // TODO: Call the actual UltraHonkVerifierContract
        
        let seq: u64 = s.get(&DataKey::PoolSequence(pool_id)).unwrap_or(0) + 1;
        s.set(&DataKey::PoolSequence(pool_id), &seq);
        Ok(seq)
    }

    pub fn collect(
        env: Env,
        proof: Bytes,
        public_inputs: Bytes,
        pool_id: u32,
    ) -> Result<(), ClmmError> {
        let s = env.storage().instance();
        
        // Get verifier contract address
        let _verifier_addr: Address = s.get(&DataKey::CollectVf).ok_or(ClmmError::ProofVerificationFailed)?;
        
        // TODO: Call the actual UltraHonkVerifierContract
        
        let seq: u64 = s.get(&DataKey::PoolSequence(pool_id)).unwrap_or(0);
        s.set(&DataKey::PoolSequence(pool_id), &(seq + 1));
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
}
