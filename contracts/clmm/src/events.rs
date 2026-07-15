//! CLMM Events Module
//!
//! Event emission for off-chain indexing and monitoring.

use soroban_sdk::{contractevent, Address};

#[contractevent(topics = ["pool_created"], data_format = "map")]
pub struct PoolCreatedEvent {
    #[topic]
    pub pool_id: u32,
    pub asset_0: u32,
    pub asset_1: u32,
    pub fee: u32,
    pub tick_spacing: u32,
}

#[contractevent(topics = ["mint"], data_format = "map")]
pub struct MintEvent {
    #[topic]
    pub pool_id: u32,
    pub owner: Address,
    pub tick_lower: i64,
    pub tick_upper: i64,
    pub amount: u128,
    pub amount_0: u64,
    pub amount_1: u64,
}

#[contractevent(topics = ["collect"], data_format = "map")]
pub struct CollectEvent {
    #[topic]
    pub pool_id: u32,
    pub owner: Address,
    pub tick_lower: i64,
    pub tick_upper: i64,
    pub amount_0: u64,
    pub amount_1: u64,
}

#[contractevent(topics = ["protocol_fee"], data_format = "map")]
pub struct ProtocolFeeClaimEvent {
    #[topic]
    pub pool_id: u32,
    pub recipient: Address,
    pub amount_0: u64,
    pub amount_1: u64,
}
