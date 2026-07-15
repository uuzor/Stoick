# Skill: On-chain Enforcement

## Finding

The Soroban pool is the final policy layer. It parses 32-byte big-endian public inputs, checks root history and nullifier/order state, binds withdrawals to concrete recipient/asset/amount arguments, calls one verifier per circuit, and only then mutates nullifier sets, active orders, the Merkle tree, or SAC balances.

## Implemented evidence

- `contracts/wraith-pool/src/lib.rs` implements `deposit`, `withdraw`, `transfer`, `place_order`, `match_orders`, `cancel_order`, and verifier calls.
- `contracts/wraith-pool/src/types.rs` defines persistent keys, events, and error codes.
- `SHARED.md` documents verifier byte formats and the public-input binding requirements.

## Privacy property

The contract does not learn private preimages, but enforces state consistency. Public withdrawals necessarily reveal recipient, asset, and amount because the SAC transfer needs those values.

## Reuse guidance

Keep all public-input parsing deterministic and action-specific. For CLMM, the pool contract should verify invariant proofs before updating tick liquidity, fee-growth accumulators, position commitments, and settlement note leaves.
