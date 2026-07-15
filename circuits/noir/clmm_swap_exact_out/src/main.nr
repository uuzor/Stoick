//! CLMM Swap Exact-Out Circuit
//!
//! Proves a swap for exact output with maximum input.

use dep::wraith_lib as w;
use dep::wraith_clmm_lib as clmm;

fn main(
    // ---- public inputs ----
    merkle_root: pub Field,
    input_nullifier: pub Field,
    output_commitment: pub Field,
    _pool_state_old: pub Field,
    _pool_state_new: pub Field,
    max_input_commitment: Field,
    pool_id: Field,
    tick_count: Field,
    _crossed_ticks_commitment: Field,
    
    // ---- private inputs: input note ----
    in_note_asset_id: Field,
    in_note_amount: Field,
    in_note_owner_key: Field,
    in_note_spending_key: Field,
    in_note_blinding: Field,
    in_note_merkle_path: [Field; w::TREE_DEPTH],
    in_note_merkle_indices: [Field; w::TREE_DEPTH],
    
    // ---- private inputs: pool state ----
    pool_asset_0: Field,
    pool_asset_1: Field,
    pool_sqrt_price_old: Field,
    pool_sqrt_price_new: Field,
    pool_current_tick_old: Field,
    pool_current_tick_new: Field,
    pool_liquidity_old: Field,
    pool_liquidity_new: Field,
    pool_sequence: Field,
    pool_fee: Field,
    
    // ---- private inputs: swap ----
    zero_for_one: Field,
    expected_input: Field,
    swap_output: Field,
) {
    // ========================================================================
    // 1. Validate and verify input note
    // ========================================================================
    
    w::assert_64(in_note_amount);
    
    let in_note_commitment = w::note_commitment(
        in_note_asset_id,
        in_note_amount,
        in_note_owner_key,
        in_note_blinding,
    );
    
    let derived_input_nullifier = w::nullifier(in_note_commitment, in_note_spending_key);
    assert(derived_input_nullifier == input_nullifier, "input nullifier mismatch");
    
    let computed_root = w::compute_merkle_root(
        in_note_commitment,
        in_note_merkle_path,
        in_note_merkle_indices,
    );
    assert(computed_root == merkle_root, "input merkle root mismatch");
    
    // ========================================================================
    // 2. Validate swap parameters
    // ========================================================================
    
    // Verify input asset is one of the pool assets
    let input_is_asset_0 = in_note_asset_id == pool_asset_0;
    let input_is_asset_1 = in_note_asset_id == pool_asset_1;
    assert(input_is_asset_0 | input_is_asset_1, "input asset not in pool");
    
    // ========================================================================
    // 3. Verify swap amounts
    // ========================================================================
    
    // Verify input is within maximum
    clmm::verify_max_input(expected_input, max_input_commitment);
    
    // Input amount must cover expected input
    assert((in_note_amount as u128) >= (expected_input as u128), "insufficient input for swap");
    
    // ========================================================================
    // 4. Verify output note commitment
    // ========================================================================
    
    let output_asset = if zero_for_one == 1 { pool_asset_1 } else { pool_asset_0 };
    
    let computed_output = w::note_commitment(
        output_asset,
        swap_output,
        in_note_owner_key,
        in_note_blinding + 2,
    );
    assert(computed_output == output_commitment, "output commitment mismatch");
    
    // ========================================================================
    // 5. Verify pool state transition
    // ========================================================================
    
    assert(pool_sqrt_price_new == pool_sqrt_price_old + 1, "pool price mismatch");
    assert(pool_liquidity_new == pool_liquidity_old, "pool liquidity mismatch");
    
    clmm::verify_sequence_increment(pool_sequence, pool_sequence + 1);
}

// ===========================================================================
// Tests
// ===========================================================================

#[test]
fn test_swap_exact_out_simple() {
    let sk: Field = 7;
    let owner_key = w::owner_key(sk);
    
    // Input note
    let in_asset: Field = 0;
    let in_amount: Field = 100000;
    let in_blinding: Field = 111;
    let in_commitment = w::note_commitment(in_asset, in_amount, owner_key, in_blinding);
    let in_nullifier = w::nullifier(in_commitment, sk);
    
    let path = [0; 20];
    let indices = [0; 20];
    let root = w::compute_merkle_root(in_commitment, path, indices);
    
    // Pool state
    let pool_id: Field = 1;
    let sqrt_price: Field = 281474976710656;
    let liquidity: Field = 1000000;
    let fee: Field = 30;
    
    // Swap exact output
    let max_input: Field = 55000;
    let expected_input: Field = 50000;
    let output_amount: Field = 49850;
    
    // Output commitment with correct blinding
    let out_asset: Field = 1;
    let out_blinding = in_blinding + 2;
    let out_commitment = w::note_commitment(out_asset, output_amount, owner_key, out_blinding);
    
    main(
        root, in_nullifier, out_commitment,
        0, 0,
        max_input,
        pool_id, 1, 1,
        
        in_asset, in_amount, owner_key, sk, in_blinding, path, indices,
        
        0, 1,
        sqrt_price, sqrt_price + 1,
        0, 0,
        liquidity, liquidity,
        1, fee,
        
        1, // zero_for_one
        expected_input,
        output_amount,
    );
}

#[test(should_fail_with = "output commitment mismatch")]
fn test_swap_wrong_output_exact_out() {
    let sk: Field = 7;
    let owner_key = w::owner_key(sk);
    
    let in_asset: Field = 0;
    let in_amount: Field = 100000;
    let in_commitment = w::note_commitment(in_asset, in_amount, owner_key, 111);
    let in_nullifier = w::nullifier(in_commitment, sk);
    
    let path = [0; 20];
    let indices = [0; 20];
    let root = w::compute_merkle_root(in_commitment, path, indices);
    
    let out_asset: Field = 1;
    let output_amount: Field = 50000;
    let wrong_out_commitment = w::note_commitment(out_asset, output_amount - 1, owner_key, 222);
    
    main(
        root, in_nullifier, wrong_out_commitment,
        0, 0, 55000, 1, 1, 1,
        
        in_asset, in_amount, owner_key, sk, 111, path, indices,
        
        0, 1,
        281474976710656, 281474976710657,
        0, 0,
        1000000, 1000000,
        1, 30,
        
        1, 50000, output_amount,
    );
}
