# Skill: Note Discovery and Encrypted Memos

## Finding

Received private outputs are delivered through encrypted event memos. The SDK derives an X25519 encryption keypair from `viewing_key`, seals note/order payloads with ephemeral X25519, HKDF-SHA256, and XChaCha20-Poly1305, and requires wallets to accept a memo only if its commitment appears in the event.

## Implemented evidence

- `sdk/src/note-crypto.ts` implements receive codes, sealed boxes, note payloads, and residual-order payloads.
- `contracts/wraith-pool/src/types.rs` includes memo vectors on transfer and match events.
- `contracts/wraith-pool/src/lib.rs` binds memo counts to actual fill/refund/residual outputs before emitting them.
- `frontend/src/lib/note-crypto.ts` re-exports SDK note-crypto to avoid frontend drift.

## Privacy property

Memos enable recipient scanning without revealing plaintext to the chain. They are untrusted transport: forged memos cannot mint value because commitments and proofs define actual state.

## Reuse guidance

A shielded CLMM should use the same memo model for minted liquidity positions, swap outputs, fee-claim notes, range-order receipts, and residual claims.
