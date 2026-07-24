# Dysentry CLMM Frontend

React/Vite workspace for the Dysentry private CLMM interface and Stellar privacy integrations.

## What is included

- Landing and liquidity pages inspired by Runway and Runway Academy's editorial product layout.
- Stellar testnet deployment config for the latest CLMM redeploy.
- Soroban transaction helpers for simulation, unsigned XDR creation, wallet signing, and submission.
- CLMM operation builders for `create_pool`, shielded `mint`, `swap`, `collect`, `burn`, public liquidity calls, and admin fee claiming.
- Public input encoders that match the current on-chain parser order.
- Proof artifact loading for Vite-served binary `proof`, `public_inputs`, and `vk` files.
- Browser-side Noir/Barretenberg prover wrapper using `@noir-lang/noir_js@1.0.0-beta.9` and `@aztec/bb.js@0.87.0`.
- Stellar wallet kit adapter for a generic `WalletSigner`.

## Commands

```bash
pnpm --filter @dysentry/clmm-frontend sync:artifacts
pnpm --filter @dysentry/clmm-frontend typecheck
pnpm --filter @dysentry/clmm-frontend build
pnpm --filter @dysentry/clmm-frontend dev
```

From the repo root:

```bash
pnpm dev -- --port 3000
```

For the current testnet transaction record, see `../docs/CLMM_TESTNET_FLOW.md`.
