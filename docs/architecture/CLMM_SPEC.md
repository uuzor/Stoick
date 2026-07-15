# CLMM Specification — Fully Shielded Concentrated Liquidity on Stellar

## Overview

This document specifies the design for a **Fully Shielded Concentrated Liquidity Market Maker (CLMM)** built on Stellar's Soroban, extending Wraith's privacy infrastructure.

---

## 1. Core CLMM Concepts (UniV3-Inspired)

### 1.1 Liquidity and Ticks

- **Ticks**: discrete price indices where the virtual reserves can change
- **Tick spacing**: configurable per pool (e.g., 1, 10, 50, 200 basis points)
- **Current tick**: the tick at or below the current price
- **Active liquidity**: total liquidity whose tick range contains the current tick

### 1.2 Position Model

A **position** represents liquidity provided within `[tick_lower, tick_upper]`:
- Earns fees when trades cross this range
- Can be partially burned by reducing liquidity within the range
- Represented as a private **PositionNote** on-chain

### 1.3 Fee Model

- **Protocol fee**: configurable percentage (e.g., 0.05%) going to the protocol
- **LP fees**: remaining fees distributed proportional to liquidity contribution
- **Fee growth**: per-unit fee accumulation tracked globally and per-tick

---

## 2. Shielded CLMM Data Structures

### 2.1 PositionNote (Private)

```
PositionNote {
  pool_id: Field,                    // Pool identifier
  tick_lower: Field,                  // Lower tick boundary
  tick_upper: Field,                 // Upper tick boundary  
  liquidity: Field,                  // Liquidity amount (u128 in circuit)
  fee_growth_inside_0_last: Field,  // Fee checkpoint asset0
  fee_growth_inside_1_last: Field,   // Fee checkpoint asset1
  tokens_owed_0: Field,              // Uncollected fees asset0
  tokens_owed_1: Field,              // Uncollected fees asset1
  owner_key: Field,                  // Owner's viewing key
  nonce: Field,                      // Random nonce for uniqueness
  blinding: Field                    // Blinding factor
}

position_commitment = H_position(domain_sep, fields...)
position_nullifier = hash2(position_commitment, spending_key)
```

### 2.2 PoolState (Committed)

Two modes:

**Mode A: Public Price / Private Positions (Phase A)**
```
PoolState {
  pool_id: Field,
  asset_0: Field,
  asset_1: Field,
  sqrt_price_x96: Field,           // Public: sqrt(price) * 2^96
  current_tick: Field,              // Public
  liquidity_active: Field,           // Public
  fee_growth_global_0: Field,       // Public
  fee_growth_global_1: Field,       // Public
  protocol_fees_0: Field,
  protocol_fees_1: Field,
  sequence: Field                   // Monotonic counter
}
```

**Mode B: Fully Shielded Pool State (Phase C)**
```
PoolStateCommitment {
  pool_id: Field,
  asset_0: Field,
  asset_1: Field,
  sqrt_price_commitment: Field,     // Committed price
  liquidity_commitment: Field,       // Committed active liquidity
  fee_growth_0_commitment: Field,
  fee_growth_1_commitment: Field,
  reserve_commitment_0: Field,
  reserve_commitment_1: Field,
  sequence: Field
}
pool_state_root = H_pool_state(domain_pool, fields...)
```

### 2.3 Tick State

```
TickState {
  tick: Field,
  liquidity_net: Field,            // Net liquidity at this tick
  liquidity_gross: Field,          // Gross liquidity at this tick
  fee_growth_outside_0: Field,
  fee_growth_outside_1: Field,
  initialized: bool
}

tick_commitment = H_tick(domain_tick, fields...)
```

---

## 3. CLMM Math Formulas

### 3.1 Price ↔ Tick Conversion

```
tick_to_price(tick) = 1.0001^tick
sqrt_price_x96 = sqrt(tick_to_price(tick)) * 2^96
```

### 3.2 Amount Calculation

For moving from `sqrt_price_a` to `sqrt_price_b` with liquidity `L`:

```
delta_x = (sqrt_price_b - sqrt_price_a) * L / (sqrt_price_a * sqrt_price_b)
delta_y = (sqrt_price_b - sqrt_price_a) * L
```

### 3.3 Fee Calculation

```
fee_growth_inside = fee_growth_global - fee_growth_outside
fees_owed = liquidity * (fee_growth_inside - fee_growth_inside_last)
```

### 3.4 Rounding Rules

| Operation | Direction | Beneficiary |
|-----------|-----------|-------------|
| `delta_x` calculation | Round up | LP |
| `delta_y` calculation | Round down | LP |
| `delta_x` input to swap | Round up | Swapper |
| `delta_y` output from swap | Round down | Swapper |
| Fee calculation | Round down | LP |
| Protocol fee | Round down | Protocol |

---

## 4. Circuit Design

### 4.1 clmm_mint

**Purpose**: Add liquidity to a position

**Public Inputs**:
```
[0] merkle_root
[1] position_nullifier (0 if new position)
[2] old_position_commitment (0 if new)
[3] new_position_commitment
[4] pool_state_commitment (old)
[5] pool_state_commitment (new)
[6] input_note_nullifier
[7] output_note_commitment (change)
[8] slippage_commitment
```

**Private Inputs**:
- Input note: asset_id, amount, owner_key, spending_key, blinding, merkle_proof
- Position: tick_lower, tick_upper, liquidity_delta, fee_growth_inside_*, tokens_owed_*
- Pool: old_sqrt_price, new_sqrt_price, liquidity, fee_growth_*

**Constraints**:
- `input_amount >= min_liquidity_value`
- `tick_lower < tick_upper`
- `tick_lower`, `tick_upper` are valid tick spacing multiples
- CLMM math holds for amount calculations
- Fee growth correctly computed
- Pool sequence increments

### 4.2 clmm_burn

**Purpose**: Remove liquidity from a position

**Public Inputs**:
```
[0] merkle_root
[1] position_nullifier
[2] old_position_commitment
[3] new_position_commitment (0 if fully closed)
[4] pool_state_commitment (old)
[5] pool_state_commitment (new)
[6] output_note_commitment_0
[7] output_note_commitment_1
```

**Constraints**:
- `burned_liquidity <= position.liquidity`
- Correct amount calculations based on current price
- Fee growth properly accumulated
- Residual position carries updated checkpoints

### 4.3 clmm_swap_exact_in

**Purpose**: Swap exact input amount for minimum output

**Public Inputs**:
```
[0] merkle_root
[1] input_nullifier
[2] output_commitment
[3] pool_state_commitment (old)
[4] pool_state_commitment (new)
[5] slippage_commitment (min_output)
[6] crossed_tick_commitments[] (if tick roots not public)
```

**Private Inputs**:
- Input note details
- Pool state details
- Tick path (crossed ticks)
- Fee calculation

**Constraints**:
- Input asset matches pool pair
- Correct CLMM swap math across all crossed ticks
- Output >= minimum slippage
- Fees deducted and accounted
- `MAX_TICKS_PER_SWAP_PROOF` boundary respected

### 4.4 clmm_collect

**Purpose**: Collect accrued fees from a position

**Public Inputs**:
```
[0] merkle_root
[1] position_nullifier
[2] old_position_commitment
[3] new_position_commitment
[4] output_note_commitment_0
[5] output_note_commitment_1
```

**Constraints**:
- Fee entitlement matches accumulated growth
- Correct amount calculations

---

## 5. Contract Interface

```rust
// Pool management
fn create_pool(env: Env, asset_0: Address, asset_1: Address, tick_spacing: i32, initial_tick: i32) -> PoolId
fn get_pool_state(env: Env, pool_id: PoolId) -> PoolState
fn get_tick(env: Env, pool_id: PoolId, tick: i32) -> Option<TickState>

// Position operations (proof-gated)
fn mint(env: Env, proof: Bytes, public_inputs: Bytes) -> Result<MintResult, ClmmError>
fn burn(env: Env, proof: Bytes, public_inputs: Bytes) -> Result<BurnResult, ClmmError>
fn collect(env: Env, proof: Bytes, public_inputs: Bytes) -> Result<CollectResult, ClmmError>
fn swap_exact_in(env: Env, proof: Bytes, public_inputs: Bytes) -> Result<SwapResult, ClmmError>
fn swap_exact_out(env: Env, proof: Bytes, public_inputs: Bytes) -> Result<SwapResult, ClmmError>

// Position transfer (optional)
fn transfer_position(env: Env, proof: Bytes, public_inputs: Bytes, recipient_key: Field) -> Result<(), ClmmError>

// Solvency (Phase C)
fn submit_checkpoint(env: Env, proof: Bytes, public_inputs: Bytes) -> Result<(), ClmmError>
fn check_solvency_status(env: Env) -> SolvencyStatus
```

---

## 6. Solvency Mechanism (Phase C)

### 6.1 Reserve Commitment Ledger

Every pool state commitment includes:
- `R0`, `R1`: committed reserve amounts
- `L`: committed active liquidity
- `fee_growth_0`, `fee_growth_1`: committed fee accumulators
- `seq`: monotonic sequence

### 6.2 Conservation Proof

Each mint/burn/swap/collect proves:
```
old_reserves + consumed_notes - emitted_notes = new_reserves
```

### 6.3 Periodic Checkpoint

Every `K` transitions (e.g., 1000), a checkpoint circuit proves:
- `R0 >= 0`, `R1 >= 0`
- `CLMM_invariant(R0, R1, price, liquidity)` holds
- Matches committed accounting tree

### 6.4 Emergency Pause

If checkpoint cadence missed:
- New mints/swaps paused
- Only conservative exits permitted
- Governance review required

---

## 7. Privacy Properties

### 7.1 Hidden

- Position owner, tick range, liquidity amount
- Swap input/output amounts and assets
- Fee entitlement and collection timing
- Links between operations

### 7.2 Public

- Pool existence and pair
- Nullifiers, commitments, proof timestamps
- Aggregate pool deltas (in public price mode)
- Deposits/withdrawals at shield boundary

### 7.3 Not Guaranteed

- Full longitudinal untraceability with public price mode
- Market unobservability

---

## 8. Implementation Phases

### Phase A: Public-State CLMM (MVP)
- Reuse Wraith notes/nullifiers/Merkle
- Public pool price, ticks, liquidity
- Private user positions and amounts
- Circuits: mint, burn, swap_exact_in, collect

### Phase B: Private Positions
- Complete CLMM formula spec and golden vectors
- Private position notes
- Commitment-based tick transitions
- Position transfer support

### Phase C: Fully Shielded Pool
- Commit to price, liquidity, reserves
- Private quote snapshots
- Conservation proofs
- Periodic solvency checkpoints

### Phase D: Production Privacy
- Batch actions
- Memo padding
- Dummy notes
- Private relayers
- Enhanced withdrawal privacy

---

## 9. Key Constants

```
TICK_SPACING_MIN = 1
TICK_SPACING_MAX = 10000
MAX_TICKS_PER_SWAP = 100           // Circuit boundary
PRICE_SCALE = 2^96                  // For sqrt_price_x96
FEE_PROTOCOL_DENOMINATOR = 10000   // 0.01% granularity
MAX_FEE = 10000                    // 100% max fee
TREE_DEPTH = 20                    // From Wraith
CHECKPOINT_INTERVAL = 1000         // Blocks between solvency proofs
```

---

## 10. References

- [Uniswap V3 Core](https://github.com/Uniswap/v3-core)
- [Wraith Privacy Model](../privacy-model/README.md)
- [CLMM Architecture](../architecture/fully-shielded-stellar-clmm.md)
- [SHARED.md](../../SHARED.md) — Cross-component invariants
