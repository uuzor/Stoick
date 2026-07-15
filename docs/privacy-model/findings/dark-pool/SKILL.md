# Skill: Dark-pool Swap Privacy

## Finding

Current swap functionality is a ZK dark pool, not a CLMM. On-chain orders are Poseidon2 commitments over side, price, amount, pair, owner, and nonce. The matcher computes midpoint fills off-chain and the `match_orders` circuit proves opposite sides, pair equality, price overlap, fill amount, settlement notes, residual orders, and refunds.

## Implemented evidence

- `SHARED.md` defines order fields and commitment ordering.
- `circuits/noir/place_order/src/main.nr`, `match_orders/src/main.nr`, and `cancel_order/src/main.nr` enforce swap constraints.
- `matcher/src/engine.ts` mirrors the circuit's midpoint/floor arithmetic and price-time matching.
- `contracts/wraith-pool/src/lib.rs` stores active order commitments and manages residual/refund outputs.

## Privacy property

The public chain sees opaque order commitments and settlement commitments. The MVP matcher, however, receives plaintext order details and can censor or prioritize, although it cannot steal funds or alter proven settlement math.

## Reuse guidance

A fully shielded CLMM should remove plaintext order disclosure from the matching path by proving swaps against committed pool state and private user notes, rather than asking a centralized matcher to see orders.
