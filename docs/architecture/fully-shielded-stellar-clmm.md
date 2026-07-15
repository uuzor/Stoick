# Architecture: Fully Shielded CLMM on Stellar

## 1. Goal

Design a Concentrated Liquidity Market Maker for Stellar where user balances, swap amounts, position ownership, range choices, fee claims, and settlement notes are shielded by default, while Soroban contracts verify solvency and CLMM invariant transitions with zero-knowledge proofs.

This design extends Wraith's implemented privacy model: Poseidon2 note commitments, nullifiers, append-only Merkle state, UltraHonk proof verification, encrypted note discovery, and on-chain public-input binding.

## 2. Existing privacy foundation to reuse

Wraith already provides the primitives a shielded CLMM needs:

- **Notes**: private balances are commitments `H(asset_id, amount, owner_key, blinding)`.
- **Nullifiers**: each spent note reveals one unlinkable deterministic spend tag.
- **Merkle state**: commitments are appended to a depth-20 Poseidon2 tree with root history.
- **Proof-gated transitions**: Soroban verifies UltraHonk proofs before spending notes, inserting outputs, or changing order state.
- **Encrypted discovery**: event memos carry note/order plaintexts sealed to a viewing-key-derived encryption key.
- **Public-input binding**: public Stellar transfers bind proof fields to concrete recipient, asset, and amount.

## 3. Threat model and privacy target

### Privacy guarantee scope

The architecture targets **unlinkability of user-owned objects and actions inside an anonymity set**, not perfect market unobservability. Even if individual swaps are batched, observers may still infer aggregate flow direction, volatility, and rough price impact from repeated pool-state transitions, public edge flows, timing, and batch-level deltas. User-facing copy must distinguish:

- **Unlinkability**: hard to link a deposit, note spend, position, swap output, collect, or withdrawal to the same owner.
- **Confidentiality**: hidden preimages for notes, positions, ranges, liquidity, and per-user amounts.
- **Not guaranteed**: full longitudinal untraceability of aggregate pool behavior, especially when public reserves or public price updates are enabled.

### Hidden from the public chain

- Trader identity and balances.
- Swap input/output amounts and assets within a supported pool pair, except aggregate public pool deltas if required by the chosen accounting mode.
- LP position owner, tick range, liquidity amount, fee entitlement, and collect timing.
- Links between deposits, swaps, mints, burns, collects, and withdrawals.

### Potentially public or partially public

- Pool existence and pair identifiers.
- Contract-level aggregate reserves and tick liquidity if the design chooses public price-state compatibility.
- Nullifiers, commitments, proof timestamps, event counts, and memo byte lengths.
- Deposits and withdrawals at the shielded layer boundary.

### Adversaries

- Chain observer correlating commitments, nullifiers, roots, and timing.
- Malicious swapper or LP trying to mint value, bypass tick accounting, double spend, or claim unearned fees.
- Malicious relayer/router attempting censorship, bad execution, memo tampering, or replay.
- Compromised note-discovery transport.

## 4. High-level system

```text
Classic Stellar assets / SACs
        |
        v
+-------------------+          +---------------------------+
| Shielded Vault    |<-------->| CLMM Pool Contract        |
| note tree         | proofs   | pool state, ticks, fees   |
| nullifier set     |          | verifier registry         |
+-------------------+          +---------------------------+
        ^                                  |
        | encrypted memos                  | pool-state events
        v                                  v
+-------------------+          +---------------------------+
| Wallet / SDK      |<-------->| Indexer + optional router |
| notes, positions  |          | root/tick witnesses       |
+-------------------+          +---------------------------+
```

The CLMM contract may be a separate contract that calls the existing Wraith pool for note insertion/nullifier checks, or a v2 pool module that extends `WraithPool`. A separate contract is cleaner for iterative deployment; a unified contract is cheaper for atomic state access.

## 5. Core private objects

### 5.1 Balance note

Same as Wraith:

```text
BalanceNote(asset_id, amount, owner_key, blinding)
commitment = H4(asset_id, amount, owner_key, blinding)
nullifier  = H2(commitment, spending_key)
```

### 5.2 Shielded LP position note

```text
PositionNote {
  pool_id,
  tick_lower,
  tick_upper,
  liquidity,
  fee_growth_inside_0_last,
  fee_growth_inside_1_last,
  tokens_owed_0,
  tokens_owed_1,
  owner_key,
  nonce,
  blinding
}
position_commitment = Hn(domain_position, fields...)
position_nullifier  = H2(position_commitment, spending_key)
```

A position note is the private equivalent of a Uniswap v3 NFT. Its owner, range, liquidity, and fee checkpoint are hidden unless voluntarily disclosed. The public contract only sees opaque position commitments and nullifiers.

### 5.3 Pool state commitment

```text
PoolState {
  pool_id,
  asset_0,
  asset_1,
  sqrt_price_x96,
  current_tick,
  liquidity_active,
  fee_growth_global_0,
  fee_growth_global_1,
  protocol_fees_0,
  protocol_fees_1,
  tick_root,
  reserve_commitment_0,
  reserve_commitment_1,
  sequence
}
pool_state_root = Hn(domain_pool_state, fields...)
```

Two modes are possible:

1. **Public price / public liquidity mode**: `sqrt_price`, current tick, active liquidity, and aggregate tick liquidity are public. User amounts and positions stay private. This is much simpler and more composable with wallets/indexers.
2. **Fully shielded pool-state mode**: pool price, active liquidity, ticks, and reserves are represented by commitments and updated only through proofs. This maximizes privacy but requires private quote discovery and heavier circuits.

For a "fully shielded" CLMM, choose mode 2 as the target, with mode 1 as a practical milestone. **Do not ship mode 2 until the solvency design below is implemented and audited**; otherwise every accepted proof becomes the only evidence that the hidden reserve commitments remain solvent.

### 5.4 Solvency when reserves are hidden

A fully hidden-reserve pool needs redundancy beyond ordinary transition proofs. The minimum acceptable design is:

1. **Reserve commitment ledger**: every pool-state commitment includes committed reserves `R0`, `R1`, active liquidity, fee accumulators, protocol fees, and a monotonically increasing sequence.
2. **Conservation proof per transition**: each mint/burn/swap/collect circuit proves that old committed reserves plus consumed notes minus emitted notes equals the new committed reserves, including fees and rounding.
3. **Periodic zk proof-of-reserves checkpoint**: every `K` state transitions, or on demand before governance upgrades, a checkpoint circuit proves that the latest committed reserves are non-negative, match the committed pool accounting tree, and satisfy the CLMM invariant for the current committed price/tick state. This proof is oracle-independent: it proves internal accounting consistency, not market value.
4. **Emergency pause rule**: if the checkpoint cadence is missed, the contract pauses new mints/swaps and permits only conservative exits or governance-reviewed recovery.
5. **Public optional audit digest**: publish a domain-separated digest of reserve commitments and checkpoint proof IDs so off-chain monitors can alert on missing or stale solvency checkpoints without learning reserves.

This turns hidden reserves from a pure trust-in-all-history model into a transition-proof plus recurring-global-invariant model. It still relies on proof-system soundness, but it avoids silently accumulating local arithmetic bugs indefinitely.

## 6. Contract storage

```text
Verifier addresses:
  mint_vf, burn_vf, swap_vf, collect_vf, position_transfer_vf, migrate_vf

Global note state:
  note_tree_frontier, note_root_history, nullifier_set

Pool registry:
  pool_id -> latest_pool_state_commitment
  pool_id -> tick_tree_root
  pool_id -> active_pool_sequence

Tick state:
  tick_commitment -> active flag
  tick_nullifier_set for replaced tick nodes

Position state:
  position_commitment -> active flag
  position_nullifier_set
```

A tick tree should be sparse and commitment-based. Each initialized tick node commits to `liquidity_gross`, `liquidity_net`, and fee-growth-outside values. A proof that crosses ticks consumes old tick commitments and publishes new tick commitments.

### 6.1 Hard proving constraints

Tick crossing is a first-order design constraint, not a later optimization. Every swap circuit must have a compile-time maximum `MAX_TICKS_PER_SWAP_PROOF`. The contract rejects proofs whose public tick-update count exceeds that cap, and SDK/router UX must split larger swaps into multiple state transitions. Two viable tracks are allowed:

- **Capped single proof**: start with a conservative cap, for example 8 or 16 initialized ticks per proof, benchmark browser proving, and force large swaps to split across sequential proofs with fresh slippage checks.
- **Recursive aggregation from day one**: prove bounded chunks and aggregate them before settlement. If recursion is chosen, it is part of the MVP architecture, not a future performance enhancement.

No design should contain an unbounded in-circuit loop over crossed ticks.

## 7. Circuit set

### 7.1 `clmm_mint`

Consumes one or more token notes, proves ownership and same-pool assets, privately selects a tick range and liquidity amount, computes required token amounts from current price/range, updates tick commitments, and emits:

- input nullifiers,
- optional change-note commitments,
- new position commitment,
- new pool-state commitment,
- new tick commitments/nullifiers,
- encrypted position memo.

Constraints:

- Token0/token1 contributions match CLMM liquidity math for the private range.
- Consumed note values equal deposited amounts plus change.
- Tick lower/upper are valid spacing multiples and lower `<` upper.
- Pool state sequence increments by one.

### 7.2 `clmm_burn`

Consumes a position note, proves ownership, computes token0/token1 owed for burned liquidity plus accrued fees, updates tick liquidity, and emits settlement notes and optional residual position.

Constraints:

- Burned liquidity `<= position.liquidity`.
- Amounts out follow CLMM formulas at current price.
- Fee growth inside is recomputed from tick data.
- Residual position carries updated fee checkpoints.

### 7.3 `clmm_swap_exact_in`

Consumes an input balance note, proves ownership, privately computes a swap along a **bounded** tick path, updates pool state/ticks/fee growth, and emits output and change commitments.

Public inputs should include only:

- root and nullifiers,
- old/new pool-state commitments,
- opaque output commitments,
- a slippage-bound commitment or public minimum-output hash,
- crossed tick old/new commitments if public tick roots are not enough.

Constraints:

- Input note asset is one side of the pool.
- Step-by-step CLMM swap math is correct across every crossed tick up to `MAX_TICKS_PER_SWAP_PROOF`; larger paths are split or recursively aggregated.
- Fees are deducted and fee growth accumulators updated.
- Output amount satisfies private or committed slippage limit.
- New reserves and price are consistent with the swap.

### 7.4 `clmm_swap_exact_out`

Similar to exact-in, but proves the required input is within a private/public maximum and returns change.

### 7.5 `clmm_collect`

Consumes a position note, proves fee entitlement from fee-growth deltas, emits fee notes, and emits an updated position note with refreshed checkpoints.

### 7.6 `clmm_position_transfer`

Consumes a position note and recreates it under a recipient owner key with encrypted memo delivery. This enables private LP position transfer without burning liquidity.

## 8. Public inputs and events

Follow Wraith's rule: public inputs are fixed-order 32-byte big-endian field elements parsed by the contract before verification.

Recommended event fields:

```text
ClmmActionEvent {
  action_kind,
  pool_id,
  old_pool_state_commitment,
  new_pool_state_commitment,
  nullifiers[],
  note_commitments[],
  position_commitments[],
  tick_commitments[],
  leaf_indices[],
  memos[]
}
```

Memos should be fixed-size padded where possible to reduce action fingerprinting.

## 9. Private quote and routing model

A fully shielded CLMM cannot expose exact path state to every observer if price/liquidity are hidden. Use one of these models:

1. **Local proving from encrypted state snapshots**: wallets receive encrypted pool/tick snapshots from indexers, prove swaps locally, and submit proofs.
2. **TEE/MPC router as an accelerator**: a router computes witnesses but cannot settle without user signatures/proofs. This improves UX but weakens the pure cryptographic privacy story.
3. **Batch auction wrapper**: users submit encrypted swap intents; a batch prover aggregates many swaps into one pool-state update, reducing timing leakage and amortizing circuit cost.

The batch model best fits full shielding: it hides individual price impact within aggregate state transitions.

## 10. Accounting and invariant strategy

CLMM arithmetic is circuit-heavy. Use bounded integer/fixed-point helpers equivalent to Wraith's 64-bit discipline, but likely upgrade intermediate products to 256-bit limb gadgets for `sqrtPriceX96` math.

Formal formula parity is a pre-Phase-B requirement. Before deploying commitment-based ticks or private positions, write a markdown/math spec and golden-vector suite for every CLMM formula: price movement, liquidity delta, amount0/amount1 delta, fee growth, tick crossing, exact-in/exact-out rounding, and collect/burn accounting. Each vector must state whether rounding favors LPs, swappers, or the pool, and Noir, SDK, matcher/router, and contract tests must consume the same fixtures.

Recommended constraints:

- Field values range-constrained before integer casts.
- Domain-separated commitments for notes, positions, ticks, and pool states.
- Integer division and rounding directions specified for each formula.
- Fee growth uses fixed-point accumulators with explicit overflow bounds.
- Every consumed object has a nullifier; every new object has a commitment.
- The contract accepts only the latest pool-state commitment, or a short history with sequence locks to prevent stale-state replay.

## 11. Stellar/Soroban integration

- Keep SAC transfers only at shield/unshield boundaries.
- Use Soroban contract storage for verifier addresses, root histories, active commitments, and pool sequence locks.
- Use Protocol-native BN254/Poseidon2 paths already proven by Wraith.
- Consider splitting verifier contracts per circuit to keep VKs immutable and action-specific.
- Add relayer support so the submitter address is not necessarily the trader.

## 12. Privacy hardening roadmap

1. **Fixed-size encrypted memos** for notes, positions, residuals, and fee claims.
2. **Action batching** so one proof can include many swaps/mints/burns.
3. **Delayed withdrawals** and standardized withdrawal denominations.
4. **Dummy notes and dummy actions** to blur event counts.
5. **Private relayers** to break wallet-to-transaction linkage.
6. **Matcher/router minimization** by moving from plaintext order submission to proof-based state transitions.
7. **Selective disclosure** for audits using viewing keys and position disclosure proofs.

## 13. Implementation phases

### Phase A: Public-state shielded CLMM MVP

- Reuse Wraith notes/nullifiers/Merkle tree.
- Keep pool price, ticks, and aggregate liquidity public.
- Hide user notes, position ownership, exact source notes, and fee recipients.
- Implement `mint`, `burn`, `swap_exact_in`, and `collect` circuits.

### Phase B: Commitment-based positions and ticks

- Complete the formal CLMM formula spec and shared golden-vector tests before any private tick-tree deployment.
- Convert positions to private position notes.
- Store tick updates as commitment transitions.
- Add position transfer and encrypted LP memo support.

### Phase C: Fully shielded pool state

- Commit to price, active liquidity, fee growth, reserves, and tick root.
- Add private quote snapshots and batch proving.
- Add reserve-commitment conservation proofs and recurring zk proof-of-reserves checkpoints before hiding reserves.
- Minimize public deltas to old/new state commitments and validity proofs.

### Phase D: Production privacy layer

- Batch actions, pad memos, add relayers, add withdrawal privacy tools, and continuously extend invariant/golden-vector coverage for new formula variants.

## 14. Key open research questions

- What benchmarked `MAX_TICKS_PER_SWAP_PROOF` is acceptable for browser, mobile, and server-side proving?
- If recursion is selected, which proof stack and verifier recursion boundary are acceptable on Stellar?
- What is the best UX for private quotes when pool state itself is hidden?
- How should emergency exits work if encrypted state indexers are unavailable?
- What public reporting, if any, should communicate aggregate flow leakage without compromising user-level unlinkability?

## 15. Bottom line

Wraith already implements the hard privacy substrate: shielded notes, nullifiers, Merkle roots, ZK-gated transitions, encrypted note discovery, and Soroban verifier integration. A fully shielded Stellar CLMM should extend that substrate from balance notes and dark-pool orders to private LP position notes, committed tick/pool state transitions, and proof-verified CLMM math. The recommended path is incremental: first hide users and positions with public aggregate pool state, then progressively commit and prove the pool state itself.
