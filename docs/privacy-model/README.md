# Wraith Privacy Model Analysis

This folder turns the repository privacy review into reusable `SKILL.md` findings. Each finding records what is implemented, where it lives, how it works, and what it implies for future private-market designs.

## Finding map

| Finding | Skill file | Core takeaway |
|---|---|---|
| Shielded notes and keys | [`findings/shielded-notes/SKILL.md`](findings/shielded-notes/SKILL.md) | Balances are hidden as Poseidon2 commitments over asset, amount, owner key, and blinding. |
| Nullifiers and Merkle state | [`findings/nullifiers-merkle/SKILL.md`](findings/nullifiers-merkle/SKILL.md) | Ownership is proven against an append-only commitment tree; one deterministic nullifier prevents double spends. |
| ZK circuit coverage | [`findings/zk-circuits/SKILL.md`](findings/zk-circuits/SKILL.md) | Withdraw, transfer, order placement, matching, and cancellation are all proof-gated. |
| On-chain enforcement | [`findings/onchain-enforcement/SKILL.md`](findings/onchain-enforcement/SKILL.md) | The Soroban pool validates roots, nullifiers, active orders, public-input bindings, and verifier calls before mutating state. |
| Note discovery | [`findings/note-discovery/SKILL.md`](findings/note-discovery/SKILL.md) | Private outputs are discoverable through encrypted event memos sealed to viewing-key-derived X25519 keys. |
| Dark-pool swap privacy | [`findings/dark-pool/SKILL.md`](findings/dark-pool/SKILL.md) | Orders are opaque commitments on-chain; match fairness is proven, while the MVP matcher sees plaintext order details. |
| Bridge privacy | [`findings/bridge-privacy/SKILL.md`](findings/bridge-privacy/SKILL.md) | Deposits and bridge mints enter the same shielded note tree, but deposit/lock facts are public at entry. |
| Privacy gaps and constraints | [`findings/privacy-gaps/SKILL.md`](findings/privacy-gaps/SKILL.md) | Deposits/withdrawals reveal public edges, the matcher is trusted for order confidentiality, and metadata leakage remains. |

The CLMM architecture derived from these findings is in [`../architecture/fully-shielded-stellar-clmm.md`](../architecture/fully-shielded-stellar-clmm.md).
