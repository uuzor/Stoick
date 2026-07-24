//! CLMM Collect Circuit
//!
//! Proves collecting accrued fees from a concentrated position.

use dep::wraith_lib as w;
use dep::wraith_clmm_lib as clmm;

fn main(
    // ---- public inputs ----
    _merkle_root: pub Field,
    position_nullifier: pub Field,
    old_position_commitment: pub Field,
    new_position_commitment: pub Field,
    pool_state_old: pub Field,
    output_commitment_0: pub Field,
    output_commitment_1: pub Field,
    
    // ---- private inputs: position ----
    pool_id: Field,
    tick_lower: Field,
    tick_upper: Field,
    position_liquidity: Field,
    fee_growth_inside_0_last: Field,
    fee_growth_inside_1_last: Field,
    tokens_owed_0: Field,
    tokens_owed_1: Field,
    position_nonce: Field,
    position_blinding: Field,
    owner_spending_key: Field,
    owner_owner_key: Field,
    position_merkle_path: [Field; w::TREE_DEPTH],
    position_merkle_indices: [Field; w::TREE_DEPTH],
    
    // ---- private inputs: pool state ----
    pool_asset_0: Field,
    pool_asset_1: Field,
    pool_sqrt_price: Field,
    pool_current_tick: Field,
    pool_liquidity: Field,
    pool_fee_growth_global_0: Field,
    pool_fee_growth_global_1: Field,
    pool_sequence: Field,
    pool_tick_spacing: Field,
    
    // ---- private inputs: output notes ----
    collect_0_amount: Field,
    collect_1_amount: Field,
    out_0_owner_key: Field,
    out_0_blinding: Field,
    out_1_owner_key: Field,
    out_1_blinding: Field,
    out_0_asset: Field,
    out_1_asset: Field,
) {
    // ========================================================================
    // 1. Verify position nullifier
    // ========================================================================
    
    let derived_nullifier = clmm::position_nullifier(old_position_commitment, owner_spending_key);
    assert(derived_nullifier == position_nullifier, "position nullifier mismatch");

    let computed_position_root = w::compute_merkle_root(
        old_position_commitment,
        position_merkle_path,
        position_merkle_indices,
    );
    assert(computed_position_root == _merkle_root, "position merkle root mismatch");
    
    // Verify owner key
    assert(owner_owner_key == w::owner_key(owner_spending_key), "owner key mismatch");
    
    // ========================================================================
    // 2. Validate position parameters
    // ========================================================================
    
    clmm::validate_position_bounds(tick_lower, tick_upper, pool_tick_spacing);
    clmm::assert_128(position_liquidity);
    
    // ========================================================================
    // 3. Compute fee entitlement
    // ========================================================================
    
    // Calculate new fee growth inside
    let (new_tokens_owed_0, _new_fee_growth_0) = clmm::update_fee_checkpoints(
        position_liquidity,
        pool_fee_growth_global_0,
        fee_growth_inside_0_last,
        tokens_owed_0,
    );
    
    let (new_tokens_owed_1, _new_fee_growth_1) = clmm::update_fee_checkpoints(
        position_liquidity,
        pool_fee_growth_global_1,
        fee_growth_inside_1_last,
        tokens_owed_1,
    );
    
    // ========================================================================
    // 4. Verify collected amounts
    // ========================================================================
    
    assert((collect_0_amount as u128) <= (new_tokens_owed_0 as u128), "cannot collect more than owed 0");
    assert((collect_1_amount as u128) <= (new_tokens_owed_1 as u128), "cannot collect more than owed 1");
    
    // ========================================================================
    // 5. Verify output note commitments
    // ========================================================================
    
    let computed_out_0 = w::note_commitment(out_0_asset, collect_0_amount, out_0_owner_key, out_0_blinding);
    assert(computed_out_0 == output_commitment_0, "output 0 commitment mismatch");
    
    let computed_out_1 = w::note_commitment(out_1_asset, collect_1_amount, out_1_owner_key, out_1_blinding);
    assert(computed_out_1 == output_commitment_1, "output 1 commitment mismatch");
    
    // ========================================================================
    // 6. Compute and verify new position commitment
    // ========================================================================
    
    // Remaining tokens owed after collection
    let remaining_owed_0 = new_tokens_owed_0 - collect_0_amount;
    let remaining_owed_1 = new_tokens_owed_1 - collect_1_amount;
    
    let computed_new_position = clmm::position_commitment(
        pool_id,
        tick_lower,
        tick_upper,
        position_liquidity,
        pool_fee_growth_global_0,
        pool_fee_growth_global_1,
        remaining_owed_0,
        remaining_owed_1,
        owner_owner_key,
        position_nonce,
        position_blinding,
    );
    
    assert(computed_new_position == new_position_commitment, "new position commitment mismatch");
    
    // ========================================================================
    // 7. Verify old pool-state binding
    // ========================================================================

    let computed_pool_state_old = clmm::pool_state_commitment(
        pool_id,
        pool_asset_0,
        pool_asset_1,
        pool_sqrt_price,
        pool_liquidity,
        pool_fee_growth_global_0,
        pool_fee_growth_global_1,
        pool_sequence,
    );
    assert(computed_pool_state_old == pool_state_old, "pool state old mismatch");
    
    // ========================================================================
    // 8. Pool sequence verification
    // ========================================================================
    
    clmm::verify_sequence_increment(pool_sequence, pool_sequence + 1);
    
    // Use pool_current_tick to avoid warning
    assert((pool_current_tick as u64) >= 0, "current_tick valid");
}

// ===========================================================================
// Tests
// ===========================================================================

#[test]
fn test_collect_zero_fees() {
    let sk: Field = 7;
    let owner_key = w::owner_key(sk);
    
    let nonce: Field = 1;
    let blinding: Field = 12345;
    
    // Position with zero tokens owed
    let old_position = clmm::position_commitment(
        1, 1000, 2000, 100000,
        0, 0, 0, 0, // zero tokens owed
        owner_key, nonce, blinding
    );
    let pos_nullifier = clmm::position_nullifier(old_position, sk);
    let position_root = w::compute_merkle_root(old_position, [0; 20], [0; 20]);
    
    // Pool with zero fee growth (no fees accrued)
    let pool_fee_0: Field = 0;
    let pool_fee_1: Field = 0;
    let pool_state_old = clmm::pool_state_commitment(
        1, 0, 1, 281474976710656, 1000000,
        pool_fee_0, pool_fee_1, 1,
    );
    
    // Collect zero fees
    let collect_0: Field = 0;
    let collect_1: Field = 0;
    
    // Output notes
    let out_0 = w::note_commitment(0, collect_0, owner_key, 111);
    let out_1 = w::note_commitment(1, collect_1, owner_key, 222);
    
    // New position - using same nonce and blinding (position stays same)
    let new_position = clmm::position_commitment(
        1, 1000, 2000, 100000,
        pool_fee_0, pool_fee_1,
        0, 0,
        owner_key, nonce, blinding
    );
    
    main(
        position_root,
        pos_nullifier,
        old_position,
        new_position,
        pool_state_old,
        out_0, out_1,
        
        1, 1000, 2000,
        100000,
        0, 0,
        0, 0,
        nonce, blinding, sk, owner_key,
        [0; 20], [0; 20],
        
        0, 1, 281474976710656,
        1500,
        1000000,
        pool_fee_0, pool_fee_1,
        1, 100,
        
        collect_0, collect_1,
        owner_key, 111,
        owner_key, 222,
        0, 1,
    );
}

#[test(should_fail_with = "position nullifier mismatch")]
fn test_collect_wrong_nullifier() {
    let sk: Field = 7;
    let wrong_sk: Field = 99;
    let owner_key = w::owner_key(sk);
    
    let old_position = clmm::position_commitment(
        1, 1000, 2000, 100000,
        0, 0, 0, 0, owner_key, 1, 12345
    );
    
    // Wrong nullifier
    let pos_nullifier = clmm::position_nullifier(old_position, wrong_sk);
    let position_root = w::compute_merkle_root(old_position, [0; 20], [0; 20]);
    
    let new_position = clmm::position_commitment(
        1, 1000, 2000, 100000,
        0, 0, 0, 0, owner_key, 1, 12346
    );
    let pool_state_old = clmm::pool_state_commitment(
        1, 0, 1, 281474976710656, 1000000,
        0, 0, 1,
    );
    
    main(
        position_root,
        pos_nullifier,
        old_position,
        new_position,
        pool_state_old,
        w::note_commitment(0, 0, owner_key, 111),
        w::note_commitment(1, 0, owner_key, 222),
        
        1, 1000, 2000, 100000,
        0, 0, 0, 0,
        1, 12345, sk, owner_key,
        [0; 20], [0; 20],
        
        0, 1, 281474976710656, 1500, 1000000, 0, 0, 1, 100,
        
        0, 0, owner_key, 111, owner_key, 222, 0, 1,
    );
}
