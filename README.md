# Wraith

**A full-privacy platform on Stellar.** Bridge assets into a shielded layer, hold private multi-asset balances, send confidential payments, and trade on a zero-knowledge dark pool — all verified on-chain by Soroban smart contracts.

> Submission for **Stellar Hacks: Real-World ZK**.

## Deployed on Stellar Testnet

The full system is live and the private round-trip is **verified on-chain**. Pool:
[`CD7EF4GG32IPVS2PGD2LMXEO3TPEWBZRUCBBSPXQ236CD6TMF5S4UUZR`](https://stellar.expert/explorer/testnet/contract/CD7EF4GG32IPVS2PGD2LMXEO3TPEWBZRUCBBSPXQ236CD6TMF5S4UUZR)
(wired to 5 UltraHonk verifiers). Proven end-to-end:

**All six flows are verified live on testnet**, each gated by a real Noir/UltraHonk proof checked inside the Soroban contract:

- **Bridge** — deposit (root matches the SDK byte-for-byte) and **withdraw** with a real ZK proof ([tx](https://stellar.expert/explorer/testnet/tx/6be9162fa0fc0d1b1fbce175eab97ed90ab3faca486a4f0adad7c7c1b10dda0d)).
- **Pay** — a 2-in/2-out **shielded transfer**, amounts hidden, value conserved in-circuit ([tx](https://stellar.expert/explorer/testnet/tx/8b8eed61eabd219c9d766f496ec19fc333549868fca2308cf7e63e00b8add90f)).
- **Swap** — hidden orders **placed**, **matched at the midpoint** ([tx](https://stellar.expert/explorer/testnet/tx/5bc05ebfa3f95849e6c6e3bff8375e6cfe09544e8c3318feb4096f81c7c4bdb3)), and **cancelled** with refund ([tx](https://stellar.expert/explorer/testnet/tx/51023894faf88329a2bd937c55ba05731860a5189aafe998e4964cf9881a4063)).
- **Soundness**: a tampered proof and a replayed nullifier are both rejected on-chain.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for every transaction.

Full contract IDs, transactions, and a one-command reproduction are in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Modules

| Module | Description |
|--------|-------------|
| **Bridge** | Move classic Stellar assets (XLM, USDC, …) in/out of Wraith via the Stellar Asset Contract. |
| **Portfolio** | View and manage shielded, multi-asset balances. |
| **Pay** | Send private payments — amounts and participants hidden. |
| **Swap** | Dark-pool DEX — hidden orders, ZK-proven fair matching, atomic settlement. |

## How the ZK is load-bearing

Every state transition out of the shielded layer (withdraw, transfer, place/cancel order, match) is gated by an **UltraHonk (Noir) zero-knowledge proof** verified inside a Soroban contract. Without a valid proof, no funds move. Privacy comes from the circuit design (hidden inputs), and integrity from on-chain verification of BN254 / Poseidon2 — the primitives Stellar shipped in Protocol 25–26.

## Repository layout

```
circuits/noir/   Noir circuits (withdraw, transfer, place_order, match_orders, cancel_order)
contracts/       Soroban smart contracts (wraith-pool + UltraHonk verifier integration)
sdk/             TypeScript client library (notes, proofs, Merkle tree, tx building)
matcher/         Off-chain order-matching service
frontend/        React app (Bridge / Portfolio / Pay / Swap)
vendor/          Reference repos (rs-soroban-ultrahonk, noir-poseidon) — gitignored
SPEC.md          Full technical specification
SHARED.md        Cross-component invariants (crypto params, encodings) — source of truth
TOOLCHAIN.md     Pinned tool versions and install steps
```

## Quick start

```bash
source ./env.sh        # put nargo / bb / stellar on PATH
# circuits
cd circuits/noir/withdraw && nargo test
# contracts
cd contracts && cargo build --target wasm32-unknown-unknown --release
# sdk / frontend
pnpm install && pnpm -r build
```

See [SPEC.md](./SPEC.md) for the full design and [TOOLCHAIN.md](./TOOLCHAIN.md) for setup.

## Status

Hackathon work-in-progress. Built on Stellar **testnet**. Components marked as MVP / mock in their READMEs where applicable.
