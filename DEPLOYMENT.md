# Wraith — Live on Stellar Testnet

The full system is deployed and the end-to-end private flow is **verified on-chain**. Every claim
below is backed by a testnet transaction you can open on stellar.expert.

## Contracts (testnet)

| Contract | ID |
|----------|----|
| **Wraith Pool** | [`CA7G45QPOS5RFTK7R5LWJSTPEGTPXDDD7FIQ3XFUN4U7FLG5WUSGXYSK`](https://stellar.expert/explorer/testnet/contract/CA7G45QPOS5RFTK7R5LWJSTPEGTPXDDD7FIQ3XFUN4U7FLG5WUSGXYSK) |
| Verifier · withdraw | `CBKB3P72CTZAGODIKMQRLUJ2INHQULK5J66N6QQR7GCHGDUFCTUPJ6M3` |
| Verifier · transfer | `CBXOZGAWSLJEXVMHY6WMBDLAJWDESUPOJV2TEAK6F77IYD7EVRDINS6I` |
| Verifier · place_order | `CDOEXIJR3OE7527IBTBGYX62TNWBIOHMR7IBMWBMBBR6QA4TIXZSBXEE` |
| Verifier · match_orders | `CB5HNMW6IIMLQPSAKAC3ADTDHEOTKX6EHYCXNK5EITTFMO33BMD2EKM4` |
| Verifier · cancel_order | `CAI6B5ZTWOGJIBLNMOG67H3MAPSORU64ZEXBB7YYQ6TQ5RQJMSQQSA3B` |

Each verifier is an instance of the `rs-soroban-ultrahonk` UltraHonk verifier, deployed with the
corresponding circuit's verification key (`circuits/artifacts/<circuit>/vk`). The pool is constructed
with all five verifier addresses.

## End-to-end evidence

| Step | Result | Transaction |
|------|--------|-------------|
| `verify_proof` with a real `withdraw` proof | **accepted** (`Ok`) | [`0e7c0dca…`](https://stellar.expert/explorer/testnet/tx/0e7c0dcaaef6be5f35e09d37960864b500c5046d97ad145b5611221fcdcaf8a0) |
| `verify_proof` with a **tampered** proof | **rejected** (`Crypto, InvalidInput` — bn254 point not on curve) | — (simulation fails) |
| `deposit` 1 XLM + note commitment | **success**, leaf index 0 | [`56cd056c…`](https://stellar.expert/explorer/testnet/tx/56cd056ce6790b05bc4ff11b34bcc77e195a2880f6c97a71034ddccb0615da97) |
| on-chain root == SDK-computed root | **byte-identical** `2a58187c…` | — |
| `withdraw` with a real ZK proof (1 XLM out) | **success**, verifier accepted on-chain | [`b74ab61d…`](https://stellar.expert/explorer/testnet/tx/b74ab61d7dd9eaf6c527886f321f6f10c4097e72a6ef0a94865e2f3a14e5b9b7) |
| `withdraw` replay (same proof) | **rejected** `NullifierUsed (#5)` | — (simulation fails) |

The deposit→withdraw pair is a complete private round-trip: 1 XLM enters the pool against an opaque
commitment, and leaves only when a valid zero-knowledge proof of ownership (against the current
Merkle root, with an unused nullifier) is verified **inside the Soroban contract**. The two
load-bearing cross-implementation invariants are both confirmed live:

1. **SDK ↔ contract Poseidon2 Merkle tree** — the off-chain tree the prover builds against and the
   on-chain tree the pool maintains produce the *same* depth-20 root.
2. **Noir/bb ↔ on-chain UltraHonk verifier** — a proof produced by `bb` (keccak transcript) is
   accepted by the Soroban verifier, and a tampered one is rejected.

## Reproduce

```bash
source ./env.sh
# 1. deploy verifiers + pool (writes deployments.json)
./scripts/deploy.sh
# 2. run the deposit -> withdraw E2E against the deployment
./scripts/e2e.sh
```

The demo note used above is deterministic (`spending_key=12345`, `blinding=67890`, `amount=1 XLM`,
`asset_id=0`), so the commitment `0f09047227…` and nullifier `02e885ea…` are reproducible.

## Known limitations (honest WIP)

- **Asset/recipient binding** (`withdraw`): the contract binds the proven `amount` but not yet the
  SAC `asset`/`recipient` Address to the proof's `asset_id`/`recipient_hash`. The canonical on-chain
  `Address→Field` encoding (matching the SDK's `addressToField`) is the remaining hardening step —
  tracked, low impact for the single-asset demo. The amount-binding + nullifier still prevent
  withdrawing more than was proven.
- Single-asset demo (native XLM). Multi-asset works by the same path with each asset's SAC.
- The matching service and the live-wired frontend are tracked separately.
