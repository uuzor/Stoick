# Wraith

**A full-privacy platform on Stellar.** Bridge assets into a shielded layer, hold private multi-asset balances, send confidential payments, and trade on a zero-knowledge dark pool — all verified on-chain by Soroban smart contracts.

> Submission for **Stellar Hacks: Real-World ZK**.

## Deployed on Stellar Testnet

The full system is live and the private round-trip is **verified on-chain**. Pool:
[`CA7G45QPOS5RFTK7R5LWJSTPEGTPXDDD7FIQ3XFUN4U7FLG5WUSGXYSK`](https://stellar.expert/explorer/testnet/contract/CA7G45QPOS5RFTK7R5LWJSTPEGTPXDDD7FIQ3XFUN4U7FLG5WUSGXYSK)
(wired to 5 UltraHonk verifiers). Proven end-to-end:

- **Deposit** 1 XLM + note commitment → on-chain Merkle root equals the SDK-computed root, byte-for-byte ([tx](https://stellar.expert/explorer/testnet/tx/56cd056ce6790b05bc4ff11b34bcc77e195a2880f6c97a71034ddccb0615da97)).
- **Withdraw** with a real Noir/UltraHonk proof verified inside the Soroban contract, releasing the funds ([tx](https://stellar.expert/explorer/testnet/tx/b74ab61d7dd9eaf6c527886f321f6f10c4097e72a6ef0a94865e2f3a14e5b9b7)).
- **Soundness**: a tampered proof and a replayed nullifier are both rejected on-chain.

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
