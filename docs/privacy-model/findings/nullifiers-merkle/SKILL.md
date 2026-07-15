# Skill: Nullifiers and Merkle State

## Finding

Spend authority is proven by Merkle membership plus knowledge of the note secret. Each note has exactly one public spend tag: `nullifier = hash2(commitment, spending_key)`. The pool rejects reused nullifiers and maintains a depth-20 append-only Poseidon2 tree with the last 100 roots accepted for proof freshness.

## Implemented evidence

- `SHARED.md` fixes the tree depth, zero values, insertion orientation, proof bit semantics, and root-history requirement.
- `contracts/wraith-pool/src/merkle.rs` implements frontier insertion, root history, known-root checks, and Poseidon2 hashing.
- `contracts/wraith-pool/src/lib.rs` checks `UnknownRoot`, `NullifierUsed`, and duplicate-nullifier cases before mutation.
- `sdk/src/merkle.ts` mirrors proof generation and root reconstruction for clients.

## Privacy property

Nullifiers reveal that some prior commitment was spent, but not which one, as long as the anonymity set contains many plausible unspent commitments.

## Reuse guidance

New shielded actions should consume old state through nullifiers and append new commitments. Avoid putting note identifiers, owner keys, or raw asset amounts into public inputs unless unavoidable for public asset movement.
