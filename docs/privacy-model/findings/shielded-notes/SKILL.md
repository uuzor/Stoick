# Skill: Shielded Notes and Keys

## Finding

Wraith represents private balances as note commitments. A `BalanceNote` carries `asset_id`, `amount`, `owner_key`, and `blinding`; its Merkle leaf is `commitment = hash4(asset_id, amount, owner_key, blinding)`. The secret `spending_key` derives `owner_key = hash2(spending_key, 0)` and `viewing_key = hash2(spending_key, 1)`.

## Implemented evidence

- `SHARED.md` defines the note, key derivation, commitment field order, native-XLM special case, and `asset_id` derivation.
- `sdk/src/note.ts` implements key derivation, note creation, output notes, and nullifier helpers with 64-bit amount checks.
- `circuits/noir/wraith_lib/src/lib.nr` exposes the same commitment helpers for circuits.

## Privacy property

The chain stores opaque commitments, so asset, amount, owner, and randomness are hidden unless revealed through entry/exit edges or encrypted note payloads.

## Reuse guidance

For any new private state object, commit to all economically relevant fields plus an owner key and fresh entropy. Never change field order without updating Noir, Soroban, SDK, tests, and golden vectors together.
