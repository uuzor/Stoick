//! CLMM Storage Module
//!
//! Persistent storage management for pools, positions, and ticks.

use crate::types::{DataKey, PoolState, PositionState, TickState};
use soroban_sdk::Env;

/// Storage manager for CLMM contract
pub struct Storage<'a> {
    env: &'a Env,
}

impl<'a> Storage<'a> {
    pub fn new(env: &'a Env) -> Self {
        Self { env }
    }

    // Admin operations
    pub fn get_admin(&self) -> Option<soroban_sdk::Address> {
        self.env.storage().get(&DataKey::Admin)
    }

    pub fn set_admin(&self, admin: soroban_sdk::Address) {
        self.env.storage().set(&DataKey::Admin, &admin);
    }

    // Pool operations
    pub fn get_last_pool_id(&self) -> u32 {
        self.env.storage().get(&DataKey::LastPoolId).unwrap_or(0)
    }

    pub fn set_last_pool_id(&self, id: u32) {
        self.env.storage().set(&DataKey::LastPoolId, &id);
    }

    pub fn get_pool(&self, pool_id: u32) -> Option<PoolState> {
        self.env.storage().get(&DataKey::Pool(pool_id))
    }

    pub fn set_pool(&self, pool_id: u32, pool: &PoolState) {
        self.env.storage().set(&DataKey::Pool(pool_id), pool);
    }

    pub fn get_pool_sequence(&self, pool_id: u32) -> u64 {
        self.env.storage().get(&DataKey::PoolSequence(pool_id)).unwrap_or(0)
    }

    pub fn incr_pool_sequence(&self, pool_id: u32) -> u64 {
        let seq = self.get_pool_sequence(pool_id);
        let new_seq = seq + 1;
        self.env.storage().set(&DataKey::PoolSequence(pool_id), &new_seq);
        new_seq
    }

    // Position operations
    pub fn get_position(&self, pool_id: u32, tick_lower: i64, tick_upper: i64) -> Option<PositionState> {
        self.env.storage().get(&DataKey::Position(pool_id, tick_lower, tick_upper))
    }

    pub fn set_position(&self, pool_id: u32, tick_lower: i64, tick_upper: i64, position: &PositionState) {
        self.env.storage().set(&DataKey::Position(pool_id, tick_lower, tick_upper), position);
    }

    pub fn remove_position(&self, pool_id: u32, tick_lower: i64, tick_upper: i64) {
        self.env.storage().remove::<_, PositionState>(&DataKey::Position(pool_id, tick_lower, tick_upper));
    }

    // Tick operations
    pub fn get_tick(&self, pool_id: u32, tick: i64) -> Option<TickState> {
        self.env.storage().get(&DataKey::Tick(pool_id, tick))
    }

    pub fn set_tick(&self, pool_id: u32, tick: i64, state: &TickState) {
        self.env.storage().set(&DataKey::Tick(pool_id, tick), state);
    }

    // Verification key operations
    pub fn get_mint_vf(&self) -> Option<soroban_sdk::Address> {
        self.env.storage().get(&DataKey::MintVf)
    }

    pub fn set_mint_vf(&self, vf: soroban_sdk::Address) {
        self.env.storage().set(&DataKey::MintVf, &vf);
    }

    pub fn get_burn_vf(&self) -> Option<soroban_sdk::Address> {
        self.env.storage().get(&DataKey::BurnVf)
    }

    pub fn set_burn_vf(&self, vf: soroban_sdk::Address) {
        self.env.storage().set(&DataKey::BurnVf, &vf);
    }

    pub fn get_swap_vf(&self) -> Option<soroban_sdk::Address> {
        self.env.storage().get(&DataKey::SwapVf)
    }

    pub fn set_swap_vf(&self, vf: soroban_sdk::Address) {
        self.env.storage().set(&DataKey::SwapVf, &vf);
    }

    pub fn get_collect_vf(&self) -> Option<soroban_sdk::Address> {
        self.env.storage().get(&DataKey::CollectVf)
    }

    pub fn set_collect_vf(&self, vf: soroban_sdk::Address) {
        self.env.storage().set(&DataKey::CollectVf, &vf);
    }

    // Protocol fee operations
    pub fn get_protocol_fee_recipient(&self) -> Option<soroban_sdk::Address> {
        self.env.storage().get(&DataKey::ProtocolFeeRecipient)
    }

    pub fn set_protocol_fee_recipient(&self, recipient: soroban_sdk::Address) {
        self.env.storage().set(&DataKey::ProtocolFeeRecipient, &recipient);
    }

    pub fn get_protocol_fee(&self) -> u32 {
        self.env.storage().get(&DataKey::ProtocolFee).unwrap_or(0)
    }

    pub fn set_protocol_fee(&self, fee: u32) {
        self.env.storage().set(&DataKey::ProtocolFee, &fee);
    }
}
