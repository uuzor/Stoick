# Skill: Bridge Privacy Boundaries

## Finding

Bridge deposits and Ethereum bridge mints create commitments in the same shielded Merkle tree as transfers and swaps. Classic Stellar deposits publicly reveal depositor, asset, amount, and commitment; Ethereum bridge-in reveals the L1 lock and the minted commitment, then subsequent movement is shielded.

## Implemented evidence

- `contracts/wraith-pool/src/lib.rs` implements public `deposit` and authorized `bridge_mint`.
- `BRIDGE_SPEC.md` and `BRIDGE_DEPLOYMENT.md` document the Ethereum lock, light-client/MPT proof path, and mint into the pool.
- `frontend/src/lib/note-secrets.ts` derives deterministic deposit blindings to recover own public-entry notes from chain data.

## Privacy property

The bridge creates a public edge into the shielded anonymity set. Privacy improves only after notes are mixed through private transfers/swaps and as more commitments accumulate.

## Reuse guidance

A CLMM should treat deposits, withdrawals, and public pool imbalance updates as edge events and make internal liquidity ownership, swap routing, fees, and position ownership commitment-based.
