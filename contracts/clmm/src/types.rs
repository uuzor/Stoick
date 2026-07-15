//! CLMM Types Module
//!
//! Core data structures for the Concentrated Liquidity Market Maker.

use soroban_sdk::{contracttype, contracterror, Address};

/// Tick spacing scale (10^-4 = 0.01%)
pub const TICK_SPACING_SCALE: u32 = 10000;

/// Pool fee denominator (basis points)
pub const FEE_DENOMINATOR: u32 = 10000;

/// Storage types
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    LastPoolId,
    Pool(u32),
    Position(u32, i64, i64),  // pool_id, tick_lower, tick_upper
    Tick(u32, i64),
    PoolSequence(u32),
    MintVf,
    BurnVf,
    SwapVf,
    CollectVf,
    ProtocolFeeRecipient,
    ProtocolFee,
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

/// Tick state
#[contracttype]
#[derive(Clone)]
pub struct TickState {
    pub tick: i64,
    pub liquidity_net: i128,
    pub liquidity_gross: u128,
    pub fee_growth_outside_0: u128,
    pub fee_growth_outside_1: u128,
    pub initialized: bool,
}
