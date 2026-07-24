//! CLMM Events Module
//!
//! Event emission for off-chain indexing and monitoring.

use soroban_sdk::{contractevent, Address, BytesN};

#[contractevent(topics = ["pool_created"], data_format = "map")]
pub struct PoolCreatedEvent {
    #[topic]
    pub pool_id: u32,
    pub asset_0: Address,
    pub asset_1: Address,
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

#[contractevent(topics = ["private_deposit"], data_format = "map")]
pub struct PrivateDepositEvent {
    #[topic]
    pub deposit_id: u64,
    pub asset: Address,
    pub from: Address,
    pub amount: u64,
    pub commitment: BytesN<32>,
    pub leaf_index: u32,
    pub root: BytesN<32>,
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
