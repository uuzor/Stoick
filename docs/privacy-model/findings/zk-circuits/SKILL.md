# Skill: ZK Circuit Coverage

## Finding

The repository implements five Noir/UltraHonk circuits: `withdraw`, `transfer`, `place_order`, `match_orders`, and `cancel_order`. These prove ownership, value conservation, order locks, match compatibility, settlement outputs, and refunds without revealing private note/order preimages.

## Implemented evidence

- `circuits/README.md` lists public inputs, constraints, arithmetic rules, tests, and known deviations.
- `circuits/noir/*/src/main.nr` contains the actual circuit logic.
- `circuits/artifacts/*` contains committed proof, public-input, and VK fixtures.
- `sdk/src/prover.ts` wires Noir/Barretenberg proof generation and public-input assembly.

## Privacy property

Private inputs stay off-chain; only proof bytes and declared public inputs are submitted. Soundness relies on the contract verifying the exact public-input order and UltraHonk proof bytes against the intended verifier key.

## Reuse guidance

For CLMM circuits, split proofs by action (`mint`, `burn`, `swap`, `collect`, `rebalance`) and publish only nullifiers, new commitments, position handles, pool roots, and bounded deltas needed by public pool accounting.
