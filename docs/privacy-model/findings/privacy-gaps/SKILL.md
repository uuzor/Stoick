# Skill: Privacy Gaps and Constraints

## Finding

The implementation is strong for hidden balances, private transfers, and opaque order settlement, but it is not a complete metadata-private system. Deposits and withdrawals reveal public edges; current dark-pool matching trusts a service with plaintext orders; note discovery leaks event timing and memo sizes; root/nullifier sets reveal action timing; and `match_orders` has documented MVP refund limitations.

## Implemented evidence

- `circuits/README.md` documents residual/refund limitations, public binders, root-history assumptions, and 64-bit ranges.
- `SPEC.md` states that deposit amounts are public and the MVP matching service sees submitted order details.
- `deploy/README.md` notes that the matcher sees order details but cannot steal funds.
- `contracts/wraith-pool/src/types.rs` events expose commitments, indices, nullifiers, and memo vectors needed for indexing.

## Privacy property

Cryptographic privacy hides preimages, but network timing, entry/exit amounts, matcher access, event correlations, and longitudinal aggregate pool deltas can still reduce anonymity. Batching improves per-action unlinkability, but does not by itself guarantee untraceability of market-level flow over time.

## Reuse guidance

The CLMM architecture must explicitly design around these gaps: capped tick-crossing proofs, early formula golden vectors, hidden-reserve solvency checkpoints, batching, delayed withdrawals, encrypted/intention-based routing, private quote discovery, dummy actions, fixed-size memos, and optional relayers should be first-class roadmap items.
