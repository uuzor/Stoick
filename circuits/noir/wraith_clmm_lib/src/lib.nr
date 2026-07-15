//! Wraith CLMM shared circuit library.
//!
//! Extends wraith_lib with CLMM-specific cryptographic primitives and math operations
//! for a fully shielded Concentrated Liquidity Market Maker on Stellar.
//!
//! All field orderings are FIXED and must match the Soroban contract and TypeScript SDK.

use dep::poseidon::poseidon2::Poseidon2;
use dep::wraith_lib as w;

// ---------------------------------------------------------------------------
// CLMM Constants
// ---------------------------------------------------------------------------

/// Tick spacing granularity (10^-4 = 0.01%)
pub global TICK_SPACING_SCALE: u32 = 10000;

/// Maximum ticks crossed in a single swap proof (circuit boundary)
pub global MAX_TICKS_PER_SWAP: u32 = 100;

// ---------------------------------------------------------------------------
// Domain Separators
// ---------------------------------------------------------------------------

/// Domain separator for position commitments
pub fn domain_position() -> Field {
    0x1001 // Different from balance notes (0) and orders (0x1000)
}

/// Domain separator for pool state commitments
pub fn domain_pool_state() -> Field {
    0x1002
}

/// Domain separator for tick state commitments
pub fn domain_tick() -> Field {
    0x1003
}

// ---------------------------------------------------------------------------
// Poseidon Hash Arities (extended from wraith_lib)
// ---------------------------------------------------------------------------

/// 5-input Poseidon2 hash -- position note commitments
pub fn hash5(a: Field, b: Field, c: Field, d: Field, e: Field) -> Field {
    Poseidon2::hash([a, b, c, d, e], 5)
}

/// 8-input Poseidon2 hash -- pool state commitments
pub fn hash8(a: Field, b: Field, c: Field, d: Field, e: Field, f: Field, g: Field, h: Field) -> Field {
    Poseidon2::hash([a, b, c, d, e, f, g, h], 8)
}

/// 3-input Poseidon2 hash -- tick state commitments
pub fn hash3(a: Field, b: Field, c: Field) -> Field {
    Poseidon2::hash([a, b, c], 3)
}

/// 6-input Poseidon2 hash -- reserve commitments
pub fn hash6(a: Field, b: Field, c: Field, d: Field, e: Field, f: Field) -> Field {
    Poseidon2::hash([a, b, c, d, e, f], 6)
}

// ---------------------------------------------------------------------------
// Position Note Commitments
// ---------------------------------------------------------------------------

/// Position note commitment field order (fixed):
/// (pool_id, tick_lower, tick_upper, liquidity, fee_growth_inside_0_last, 
///  fee_growth_inside_1_last, tokens_owed_0, tokens_owed_1, owner_key, nonce, blinding)
///
/// Note: We use hash11 by hashing multiple rounds for 11 fields
pub fn position_commitment(
    pool_id: Field,
    tick_lower: Field,
    tick_upper: Field,
    liquidity: Field,
    fee_growth_inside_0_last: Field,
    fee_growth_inside_1_last: Field,
    tokens_owed_0: Field,
    tokens_owed_1: Field,
    owner_key: Field,
    nonce: Field,
    blinding: Field,
) -> Field {
    // Hash in two rounds: first 6 fields, then combine with remaining
    let phase1 = hash6(
        pool_id,
        tick_lower,
        tick_upper,
        liquidity,
        fee_growth_inside_0_last,
        fee_growth_inside_1_last,
    );
    let phase2 = hash5(
        tokens_owed_0,
        tokens_owed_1,
        owner_key,
        nonce,
        blinding,
    );
    // Final domain-separated hash
    Poseidon2::hash([domain_position(), phase1, phase2], 3)
}

/// Position nullifier: hash2(position_commitment, spending_key)
pub fn position_nullifier(position_commitment: Field, spending_key: Field) -> Field {
    w::hash2(position_commitment, spending_key)
}

/// Validate position bounds using wraith_lib comparison helpers
pub fn validate_position_bounds(
    tick_lower: Field,
    tick_upper: Field,
    _tick_spacing: Field,
) {
    // Use assert_64 for range check then compare as integers
    w::assert_64(tick_lower);
    w::assert_64(tick_upper);
    // Compare as u64 since both are range-checked
    assert((tick_lower as u64) < (tick_upper as u64), "tick_lower must be less than tick_upper");
}

// ---------------------------------------------------------------------------
// Pool State Commitments
// ---------------------------------------------------------------------------

/// Pool state commitment for fully shielded mode (Phase C)
///
/// Field order (fixed):
/// (pool_id, asset_0, asset_1, sqrt_price_commitment, liquidity_commitment,
///  fee_growth_0_commitment, fee_growth_1_commitment, sequence)
pub fn pool_state_commitment(
    pool_id: Field,
    asset_0: Field,
    asset_1: Field,
    sqrt_price_commitment: Field,
    liquidity_commitment: Field,
    fee_growth_0_commitment: Field,
    fee_growth_1_commitment: Field,
    sequence: Field,
) -> Field {
    hash8(
        pool_id,
        asset_0,
        asset_1,
        sqrt_price_commitment,
        liquidity_commitment,
        fee_growth_0_commitment,
        fee_growth_1_commitment,
        sequence,
    )
}

/// Pool state commitment for public price mode (Phase A)
///
/// In Phase A, only the non-public fields are committed
pub fn pool_state_commitment_public_price(
    pool_id: Field,
    fee_growth_0_commitment: Field,
    fee_growth_1_commitment: Field,
    protocol_fees_0: Field,
    protocol_fees_1: Field,
    sequence: Field,
) -> Field {
    // Simplified commitment for public-price mode
    hash6(
        pool_id,
        fee_growth_0_commitment,
        fee_growth_1_commitment,
        protocol_fees_0,
        protocol_fees_1,
        sequence,
    )
}

// ---------------------------------------------------------------------------
// Tick State Commitments
// ---------------------------------------------------------------------------

/// Tick state commitment
/// (tick, liquidity_net, fee_growth_outside_0, fee_growth_outside_1, initialized)
pub fn tick_commitment(
    tick: Field,
    liquidity_net: Field,
    fee_growth_outside_0: Field,
    fee_growth_outside_1: Field,
    initialized: Field,
) -> Field {
    // initialized is 0 or 1 (boolean field)
    hash5(tick, liquidity_net, fee_growth_outside_0, fee_growth_outside_1, initialized)
}

// ---------------------------------------------------------------------------
// Reserve Commitments
// ---------------------------------------------------------------------------

/// Reserve commitment for solvency proofs
/// (pool_id, reserve_0, reserve_1, liquidity, fee_growth_0, fee_growth_1)
pub fn reserve_commitment(
    pool_id: Field,
    reserve_0: Field,
    reserve_1: Field,
    liquidity: Field,
    fee_growth_0: Field,
    fee_growth_1: Field,
) -> Field {
    hash6(pool_id, reserve_0, reserve_1, liquidity, fee_growth_0, fee_growth_1)
}

// ---------------------------------------------------------------------------
// CLMM Math Helpers (bounded integer arithmetic)
// ---------------------------------------------------------------------------

/// Range-check to 128 bits for liquidity amounts and large calculations
pub fn assert_128(x: Field) {
    x.assert_max_bit_size::<128>();
}

/// Range-check to 24 bits for tick values (-887272 to 887272 fits in signed 20 bits)
pub fn assert_tick(tick: Field) {
    // Tick range: roughly [-2^20, 2^20]
    tick.assert_max_bit_size::<21>();
}

/// Check if value a is less than value b (both range-checked to 64 bits)
pub fn lt64(a: Field, b: Field) -> bool {
    (a as u64) < (b as u64)
}

/// Check if value a is less than or equal to value b (both range-checked to 64 bits)
pub fn leq64(a: Field, b: Field) -> bool {
    (a as u64) <= (b as u64)
}

/// Calculate delta_y when moving from sqrt_price_a to sqrt_price_b
/// 
/// Formula: delta_y = abs(sqrt_price_b - sqrt_price_a) * liquidity
pub fn calc_delta_y_liquidity(
    sqrt_price_a: Field,
    sqrt_price_b: Field,
    liquidity: Field,
) -> Field {
    let delta_sqrt = if lt64(sqrt_price_b, sqrt_price_a) {
        sqrt_price_a - sqrt_price_b
    } else {
        sqrt_price_b - sqrt_price_a
    };
    
    // Simplified multiplication - actual implementation needs 256-bit
    // This is a placeholder for the real implementation
    delta_sqrt * liquidity
}

/// Calculate fee amount from fee growth delta
/// 
/// Formula: fees = liquidity * fee_growth_delta / FEE_DENOMINATOR
/// Using u128 intermediate for precision
pub fn calc_fees(liquidity: Field, fee_growth_delta: Field) -> Field {
    let fee_denominator: u128 = 10000;
    let fees = (liquidity as u128) * (fee_growth_delta as u128);
    (fees / fee_denominator) as Field // Round down to LP
}

/// Calculate protocol fee
/// 
/// Formula: protocol_fee = fees * protocol_fee_percent / FEE_DENOMINATOR
pub fn calc_protocol_fee(fees: Field, protocol_fee_percent: Field) -> Field {
    let fee_denominator: u128 = 10000;
    let protocol = (fees as u128) * (protocol_fee_percent as u128);
    (protocol / fee_denominator) as Field // Round down
}

// ---------------------------------------------------------------------------
// Fee Growth Calculations
// ---------------------------------------------------------------------------

/// Compute fee growth inside a tick range
/// 
/// fee_growth_inside = fee_growth_global - fee_growth_outside
/// Note: Simplified version assumes current tick is within range
pub fn fee_growth_inside_simple(
    fee_growth_global: Field,
    fee_growth_outside: Field,
) -> Field {
    fee_growth_global - fee_growth_outside
}

/// Update fee growth checkpoints for a position
/// 
/// Returns (new_tokens_owed, new_fee_growth_inside_last)
pub fn update_fee_checkpoints(
    liquidity: Field,
    fee_growth_inside: Field,
    fee_growth_inside_last: Field,
    tokens_owed: Field,
) -> (Field, Field) {
    // Check if fee_growth_inside >= fee_growth_inside_last
    let has_growth = (fee_growth_inside as u128) >= (fee_growth_inside_last as u128);
    
    let fee_delta = if has_growth {
        fee_growth_inside - fee_growth_inside_last
    } else {
        0 // No negative fees
    };
    
    let fee_u128 = (liquidity as u128) * (fee_delta as u128);
    let new_tokens_owed = tokens_owed + (fee_u128 as Field);
    (new_tokens_owed, fee_growth_inside)
}

// ---------------------------------------------------------------------------
// Slippage and Bounds Checking
// ---------------------------------------------------------------------------

/// Verify slippage constraint for swap output
pub fn verify_min_output(
    actual_output: Field,
    min_output_commitment: Field,
) {
    // Both are range-checked 64-bit values
    assert(leq64(min_output_commitment, actual_output), "slippage exceeded");
}

/// Verify slippage constraint for swap input
pub fn verify_max_input(
    actual_input: Field,
    max_input_commitment: Field,
) {
    // Both are range-checked 64-bit values
    assert(leq64(actual_input, max_input_commitment), "slippage exceeded");
}

// ---------------------------------------------------------------------------
// Liquidity Validation
// ---------------------------------------------------------------------------

/// Verify liquidity delta is valid for mint (increasing)
pub fn validate_liquidity_delta_mint(
    old_liquidity: Field,
    new_liquidity: Field,
) {
    assert_128(new_liquidity);
    // new must be >= old for mint
    assert((new_liquidity as u128) >= (old_liquidity as u128), "mint must increase liquidity");
}

/// Verify liquidity delta is valid for burn (decreasing)
pub fn validate_liquidity_delta_burn(
    old_liquidity: Field,
    new_liquidity: Field,
) {
    assert_128(new_liquidity);
    // new must be <= old for burn
    assert((new_liquidity as u128) <= (old_liquidity as u128), "burn must decrease liquidity");
}

/// Verify liquidity is positive
pub fn assert_liquidity_positive(liquidity: Field) {
    assert((liquidity as u128) > 0, "liquidity must be positive");
}

// ---------------------------------------------------------------------------
// Pool Sequence Validation
// ---------------------------------------------------------------------------

/// Verify pool sequence incremented correctly
pub fn verify_sequence_increment(old_seq: Field, new_seq: Field) {
    assert((new_seq as u64) == ((old_seq as u64) + 1), "sequence must increment by 1");
}

// ---------------------------------------------------------------------------
// Tick Position Checks
// ---------------------------------------------------------------------------

/// Check if current tick is within position range
/// Returns true if: tick_lower <= current_tick < tick_upper
pub fn is_tick_in_range(
    tick_lower: Field,
    tick_upper: Field,
    current_tick: Field,
) -> bool {
    // tick_lower <= current_tick: geq64(current_tick, tick_lower)
    // current_tick < tick_upper: gt64(tick_upper, current_tick)
    w::geq64(current_tick, tick_lower) & w::gt64(tick_upper, current_tick)
}

// ---------------------------------------------------------------------------
// Library Self-Tests
// ---------------------------------------------------------------------------

#[test]
fn test_position_commitment_determinism() {
    let pool_id: Field = 1;
    let tick_lower: Field = 1000;
    let tick_upper: Field = 2000;
    let liquidity: Field = 1000000;
    let owner_key = w::owner_key(7);
    let nonce: Field = 42;
    let blinding: Field = 12345;
    
    let c1 = position_commitment(
        pool_id, tick_lower, tick_upper, liquidity, 0, 0, 0, 0, owner_key, nonce, blinding
    );
    let c2 = position_commitment(
        pool_id, tick_lower, tick_upper, liquidity, 0, 0, 0, 0, owner_key, nonce, blinding
    );
    
    assert(c1 == c2, "same inputs must produce same commitment");
}

#[test]
fn test_position_commitment_uniqueness() {
    let owner_key = w::owner_key(7);
    
    let c1 = position_commitment(1, 1000, 2000, 1000000, 0, 0, 0, 0, owner_key, 1, 12345);
    let c2 = position_commitment(1, 1000, 2000, 1000000, 0, 0, 0, 0, owner_key, 2, 12345);
    
    assert(c1 != c2, "different nonces must produce different commitments");
}

#[test]
fn test_position_nullifier_determinism() {
    let commitment: Field = 123456;
    let spending_key: Field = 7;
    
    let nf1 = position_nullifier(commitment, spending_key);
    let nf2 = position_nullifier(commitment, spending_key);
    
    assert(nf1 == nf2, "same inputs must produce same nullifier");
    assert(nf1 == w::hash2(commitment, spending_key), "must match hash2");
}

#[test]
fn test_pool_state_commitment() {
    let pool_id: Field = 1;
    let sqrt_price: Field = 281474976710656; // 2^48 as Field literal
    let liquidity: Field = 1000000;
    
    let pc = pool_state_commitment(pool_id, 0, 0, sqrt_price, liquidity, 0, 0, 1);
    assert(pc != 0, "pool commitment must be non-zero");
}

#[test]
fn test_tick_commitment() {
    let tick: Field = 1000;
    let liquidity_net: Field = 500000;
    
    let tc = tick_commitment(tick, liquidity_net, 0, 0, 1);
    assert(tc != 0, "tick commitment must be non-zero");
}

#[test]
fn test_fee_growth_inside_simple() {
    let fee_global: Field = 1000000;
    let fee_outside: Field = 0;
    
    let inside = fee_growth_inside_simple(fee_global, fee_outside);
    assert(inside == fee_global, "fee growth inside should equal global");
}

#[test]
fn test_update_fee_checkpoints() {
    let liquidity: Field = 1000;
    let fee_growth_new: Field = 500;
    let fee_growth_last: Field = 300;
    let tokens_owed: Field = 100;
    
    let (new_owed, new_last) = update_fee_checkpoints(liquidity, fee_growth_new, fee_growth_last, tokens_owed);
    
    // 200 * 1000 = 200000 added to owed
    let expected_owed = tokens_owed + 200000;
    assert(new_owed == expected_owed, "tokens_owed should increase by liquidity * fee_delta");
    assert(new_last == fee_growth_new, "fee_growth_inside_last should update");
}

#[test]
fn test_validate_position_bounds() {
    let lower: Field = 1000;
    let upper: Field = 2000;
    let spacing: Field = 100;
    
    validate_position_bounds(lower, upper, spacing);
    // Test passes if no assertion fails
}

#[test(should_fail_with = "tick_lower must be less than tick_upper")]
fn test_validate_position_bounds_rejects_inverted() {
    let lower: Field = 2000;
    let upper: Field = 1000;
    let spacing: Field = 100;
    
    validate_position_bounds(lower, upper, spacing);
}

#[test]
fn test_sequence_increment() {
    let old_seq: Field = 5;
    let new_seq: Field = 6;
    
    verify_sequence_increment(old_seq, new_seq);
    // Test passes if no assertion fails
}

#[test(should_fail_with = "sequence must increment by 1")]
fn test_sequence_increment_rejects_skip() {
    let old_seq: Field = 5;
    let new_seq: Field = 7; // Skipped 6
    
    verify_sequence_increment(old_seq, new_seq);
}

#[test]
fn test_tick_in_range() {
    let lower: Field = 1000;
    let upper: Field = 2000;
    let current: Field = 1500;
    
    let result = is_tick_in_range(lower, upper, current);
    assert(result, "current tick should be in range");
}

#[test]
fn test_tick_below_range() {
    let lower: Field = 1000;
    let upper: Field = 2000;
    let current: Field = 500;
    
    let result = is_tick_in_range(lower, upper, current);
    assert(!result, "current tick should be below range");
}
