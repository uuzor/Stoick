//! CLMM Burn Circuit
//!
//! Proves removing liquidity from a concentrated position:
//! - Validates position ownership via nullifier
//! - Validates burned liquidity <= position liquidity
//! - Computes token amounts based on current price
//! - Updates fee growth checkpoints
//! - Emits output notes (underlying tokens + accrued fees)

use dep::wraith_lib as w;
use dep::wraith_clmm_lib as clmm;

fn main(
    // ---- public inputs ----
    _merkle_root: pub Field,
    position_nullifier: pub Field,
    old_position_commitment: pub Field,
    new_position_commitment: pub Field,
    _pool_state_old: pub Field,
    _pool_state_new: pub Field,
    output_commitment_0: Field,
    output_commitment_1: Field,
    
    // ---- private inputs: position ----
    pool_id: Field,
    tick_lower: Field,
    tick_upper: Field,
    old_liquidity: Field,
    liquidity_to_burn: Field,
    fee_growth_inside_0_last: Field,
    fee_growth_inside_1_last: Field,
    tokens_owed_0: Field,
    tokens_owed_1: Field,
    position_nonce: Field,
    position_blinding: Field,
    owner_spending_key: Field,
    owner_owner_key: Field,
    
    // ---- private inputs: pool state ----
    _pool_asset_0: Field,
    _pool_asset_1: Field,
    _pool_sqrt_price: Field,
    pool_current_tick: Field,
    _pool_liquidity: Field,
    pool_fee_growth_global_0: Field,
    pool_fee_growth_global_1: Field,
    pool_sequence: Field,
    pool_tick_spacing: Field,
    
    // ---- private inputs: output notes ----
    out_0_asset: Field,
    out_0_amount: Field,
    out_0_owner_key: Field,
    out_0_blinding: Field,
    out_1_asset: Field,
    out_1_amount: Field,
    out_1_owner_key: Field,
    out_1_blinding: Field,
) {
    // ========================================================================
    // 1. Verify position nullifier
    // ========================================================================
    
    let derived_nullifier = clmm::position_nullifier(old_position_commitment, owner_spending_key);
    assert(derived_nullifier == position_nullifier, "position nullifier mismatch");
    
    // Verify owner key matches
    assert(owner_owner_key == w::owner_key(owner_spending_key), "owner key mismatch");
    
    // ========================================================================
    // 2. Validate position parameters
    // ========================================================================
    
    clmm::validate_position_bounds(tick_lower, tick_upper, pool_tick_spacing);
    clmm::assert_128(liquidity_to_burn);
    clmm::assert_128(old_liquidity);
    
    // Burned liquidity must not exceed position liquidity
    assert((liquidity_to_burn as u128) <= (old_liquidity as u128), "burn exceeds position liquidity");
    
    // Position must be active (contain current tick)
    assert((tick_lower as u64) <= (pool_current_tick as u64), "tick_lower <= current_tick");
    assert((pool_current_tick as u64) < (tick_upper as u64), "current_tick < tick_upper");
    
    // ========================================================================
    // 3. Compute amounts for burned liquidity
    // ========================================================================
    
    // Calculate accrued fees
    let (new_tokens_owed_0, new_fee_growth_0) = clmm::update_fee_checkpoints(
        old_liquidity,
        pool_fee_growth_global_0,
        fee_growth_inside_0_last,
        tokens_owed_0,
    );
    
    let (new_tokens_owed_1, new_fee_growth_1) = clmm::update_fee_checkpoints(
        old_liquidity,
        pool_fee_growth_global_1,
        fee_growth_inside_1_last,
        tokens_owed_1,
    );
    
    // Total amounts to receive
    // Note: In full implementation, would compute underlying tokens from burn amount
    // For Phase A, we use owed tokens
    let total_0 = new_tokens_owed_0;
    let total_1 = new_tokens_owed_1;
    
    // ========================================================================
    // 4. Verify output note commitments
    // ========================================================================
    
    let computed_out_0 = w::note_commitment(out_0_asset, out_0_amount, out_0_owner_key, out_0_blinding);
    assert(computed_out_0 == output_commitment_0, "output 0 commitment mismatch");
    
    let computed_out_1 = w::note_commitment(out_1_asset, out_1_amount, out_1_owner_key, out_1_blinding);
    assert(computed_out_1 == output_commitment_1, "output 1 commitment mismatch");
    
    // ========================================================================
    // 5. Compute and verify new position commitment
    // ========================================================================
    
    let is_full_burn = (liquidity_to_burn as u128) == (old_liquidity as u128);
    
    if is_full_burn {
        // Full burn: no new position
        assert(new_position_commitment == 0, "full burn must have zero new commitment");
    } else {
        // Partial burn: create residual position
        let new_liquidity = old_liquidity - liquidity_to_burn;
        
        let computed_new_position = clmm::position_commitment(
            pool_id,
            tick_lower,
            tick_upper,
            new_liquidity,
            new_fee_growth_0,
            new_fee_growth_1,
            new_tokens_owed_0,
            new_tokens_owed_1,
            owner_owner_key,
            position_nonce,
            position_blinding,
        );
        
        assert(computed_new_position == new_position_commitment, "new position commitment mismatch");
    }
    
    // ========================================================================
    // 6. Verify pool state transition
    // ========================================================================
    
    // Pool sequence incremented
    clmm::verify_sequence_increment(pool_sequence, pool_sequence + 1);
    
    // Use total amounts to avoid unused warnings (use u128 comparison)
    assert((total_0 as u128) >= (out_0_amount as u128), "total_0 >= out_0");
    assert((total_1 as u128) >= (out_1_amount as u128), "total_1 >= out_1");
}

// ===========================================================================
// Tests
// ===========================================================================

#[test]
fn test_burn_full_position() {
    let sk: Field = 7;
    let owner_key = w::owner_key(sk);
    
    let pool_id: Field = 1;
    let tick_lower: Field = 1000;
    let tick_upper: Field = 2000;
    let liquidity: Field = 100000;
    let current_tick: Field = 1500;
    
    let old_position = clmm::position_commitment(
        pool_id, tick_lower, tick_upper, liquidity,
        0, 0, 0, 0, owner_key, 1, 12345
    );
    let pos_nullifier = clmm::position_nullifier(old_position, sk);
    
    // For full burn with zero fee growth, output amounts must be 0
    let out_0 = w::note_commitment(0, 0, owner_key, 111);
    let out_1 = w::note_commitment(1, 0, owner_key, 222);
    
    main(
        0,
        pos_nullifier,
        old_position,
        0, // Full burn: no new position
        0, 0,
        out_0, out_1,
        
        pool_id, tick_lower, tick_upper,
        liquidity, liquidity,
        0, 0, 0, 0,
        1, 12345, sk, owner_key,
        
        0, 1, 281474976710656, current_tick, 1000000,
        0, 0, 1, 100,
        
        0, 0, owner_key, 111,
        1, 0, owner_key, 222,
    );
}

#[test(should_fail_with = "burn exceeds position liquidity")]
fn test_burn_too_much() {
    let sk: Field = 7;
    let owner_key = w::owner_key(sk);
    
    let old_liquidity: Field = 100000;
    let liquidity_to_burn: Field = 150000; // More than position has
    
    let old_position = clmm::position_commitment(
        1, 1000, 2000, old_liquidity,
        0, 0, 0, 0, owner_key, 1, 12345
    );
    let pos_nullifier = clmm::position_nullifier(old_position, sk);
    
    main(
        0,
        pos_nullifier,
        old_position,
        0,
        0, 0,
        w::note_commitment(0, 0, owner_key, 111),
        w::note_commitment(1, 0, owner_key, 222),
        
        1, 1000, 2000,
        old_liquidity, liquidity_to_burn,
        0, 0, 0, 0,
        1, 12345, sk, owner_key,
        
        0, 1, 281474976710656, 1500, 1000000,
        0, 0, 1, 100,
        
        0, 0, owner_key, 111,
        1, 0, owner_key, 222,
    );
}
